# Sequential retention state machine, announcements and additive migration (backend)

The backend upgrades the first-pass free-for-all retention into a server-driven Team 1..N sequence. The active team lives in `Room.retention` (phase, frozen order, `activeTeamId`, drafts, confirmed picks, completed turns), and the acting team is always resolved from the authenticated user, never from the payload. Money and squads change only at finalize, and every confirmed or skipped turn carries a uuid that doubles as the announcement event id. An additive migration and an apply script were written but not applied, as the brief requires. The coder recorded `tsc` passing and the full vitest run at 259 pass / 7 fail, where the failures are the 6 known skip-vote cases plus one manager-mode load timeout that passes alone; retention.test.ts is 38/38.

Watch for: legacy first-pass `OPEN` picks are discarded rather than converted to drafts (confirmed, deviation recorded, purse restored). A room closed from the lobby emits no `RETENTION_RESET` when only skipped turns or drafts exist (confirmed, minor). The Postgres ledger path and the migration are unexercised until the orchestrator applies them (confirmed, expected).

**Verdict**: APPROVED

## High-level view

The state machine is a set of pure functions over the draft room, run inside `RoomManager.mutate`. That gives each command the existing per-room lock, CAS commit and `requestId` idempotency. Out-of-order protection is structural: only the active team's manager can draft, remove, confirm or skip, and the host can additionally start, skip for an absent manager, finalize and reset. Confirm needs 1 to 3 drafts and zero retention needs an explicit skip.

Purses and squads are untouched until `FINALIZE_RETENTIONS`, which materializes every confirmed pick as a 30-unit `RETENTION` purchase plus a SOLD player entry, giving 200 / 185 / 170 / 155 for 0 / 1 / 2 / 3 retained. `START_AUCTION` is gated on phase `FINALIZED`, and the FC26 pool builder keeps SOLD players out of the queue.

Real-time delivery reuses the one WebSocket path. Drafts are broadcast only as anonymous `RETENTION_PLAYER_RESERVED` ids, `ROOM_STATE` exposes `ownDraft` only to the owning viewer, and the announcement payload is built from confirmed turns that also sit in `ROOM_STATE.retention.turns` for reconnects.

<details>
<summary>Issues (4)</summary>

1. **Legacy OPEN picks discarded** (confirmed) — `normalizeLegacyRetention` reverses purchases and drops picks instead of converting them to drafts (plan D2). The money is restored, but unconfirmed first-pass selections are lost. Acceptable because those picks were never finalized; keep it in the final report.
2. **Reset-on-close emits nothing without picks** (confirmed, minor) — `END_AUCTION` in the lobby only emits `RETENTION_RESET` when `removed.length > 0`. With only skipped turns or drafts, the ledger skips its sync and stale `auction_retention_turns` rows stay. Emit the event whenever `room.retention` existed.
3. **START_RETENTION does not check catalog availability** (likely, minor) — settings validation forces the FC26 source, but an unavailable catalog is only discovered when the first draft fails with a 404. A guard in `START_RETENTION` would fail earlier. The host can still skip every turn, so this is not blocking.
4. **Migration and ledger unexercised against Postgres** (confirmed, expected) — apply `20261002090000_retention_sequential.sql` with `node scripts/apply-retention-sequential-schema.mjs` (dry run, then `--apply`) before relying on the DB mirror. The ledger swallows errors until then.

</details>

<details>
<summary>Details</summary>

### Turn ownership and host powers

`requireActiveTurn` resolves the active team from `retention.activeTeamId` and compares it with the acting member. Non-active members get `NOT_ACTIVE_TEAM`, and a team that already finished gets `TURN_ALREADY_COMPLETED`. Only `SKIP_RETENTION` accepts the host acting on the active team's behalf. The host cannot select or confirm for another team, which keeps drafts private. The tests cover non-active select/remove/confirm/skip, client-supplied team or price being ignored, host skip, and concurrent selection of one player where exactly one wins.

### Privacy of unconfirmed selections

Drafts never enter `players`, `purchases` or `playerIds`. `retentionState(room, viewer)` returns `reservedPlayerIds` (ids only) to everyone and `ownDraft` snapshots only to the owner. The search route excludes confirmed picks and other teams' drafts, and flags the viewer's own. A dedicated test asserts no owner or player data reaches another viewer. The active team is public by design, so a reservation implicitly belongs to it. That is inherent to a sequential flow and not a leak of unconfirmed data beyond the id.

### Finalize, purses and the queue

`finalizeRetentions` requires `ALL_TEAMS_COMPLETED` and applies picks in one commit, recomputing base prices from rating and pool. `dematerialize` reverses this for reset in the lobby. The `START_AUCTION` FC26 branch keeps SOLD players and filters them from the catalog list, so retained players cannot enter the queue. Tests cover the 200/185/170/155 purses, absence from queue, active slot, unsold and recall across a whole auction, and bidding afterwards.

### Persistence and ledger

Each completed turn is mirrored to `auction_retention_turns` with `unique(room_id, team_id)`, and confirmed picks to `auction_retentions` with the new columns. `InMemoryRetentionLedger` mirrors the unique and cap rules. The SQL is additive and guarded: it replaces the status check by inspecting `pg_constraint`, adds a team/player unique index, adds a trigger-based 3-player backstop that excludes the same player so upserts are not double counted, and creates the turns table with RLS and service-role-only grants.

### Compatibility

`ValidatingHydrator` now runs settings through `settingsSchema`, so snapshots saved without the retention or pool-source keys come back as retention OFF (tested). Legacy `FINALIZED` retention survives as is, and `assertRoom` skips the order/turn invariants when no order exists. Retention OFF takes the unchanged `START_AUCTION` path, and the gate accepts only `OFF` or `FINALIZED`. Membership changes and purse, source or retention-flag edits are locked once the phase leaves `NOT_STARTED`.

### Test coverage

retention.test.ts covers OFF, order enforcement, 0 to 3 retained, the fourth player, duplicate and cross-team duplicate, purse and squad limits, skip, idempotent confirm replay, unique announcement ids, the all-complete event, host-only finalize, reset, locks, repository reload, multi-client delivery with reconnect and no replay, the ledger, the tampered-state invariants and legacy snapshots. Not tested: the Postgres ledger and trigger against a real database.

</details>

<details>
<summary>File map</summary>

Full diff: `git diff 44ab6d0..a5fe38f` (commits 55ba4bf and a5fe38f).

- `domain/types.ts`: new retention phase, turn, draft and pick fields
- `modules/retention/retention.service.ts`: sequential state machine, announcements, legacy normalization
- `modules/retention/retention.ledger.ts`: turn rows, new pick columns, CONFIRMED status
- `modules/auction/auction.engine.ts`, `auction.schemas.ts`: new commands, events, START gate
- `modules/auction/squad.service.ts`: `assertRoom` invariants for the new model
- `modules/rooms/{room-state,room.manager,room.service,room.routes}.ts`: per-viewer projection, hydrator, membership guard, acquisition fields
- `modules/teams/team.service.ts`: pending retention spend in the purse
- `modules/fc26/{fc26.routes,fc26.positions}.ts`: draft-aware search, CDM/CMID/CAM groups
- `supabase/migrations/20261002090000_retention_sequential.sql`, `backend/scripts/apply-retention-sequential-schema.mjs`, both generated types files: schema work, not applied
- `backend/tests/retention.test.ts`, `backend/WEBSOCKET_PROTOCOL.md`, `backend/AUCTION_RULES.md`: tests and docs

</details>
