# Final report: sequential retention, announcements, retained visibility, live auction redesign

Range reviewed: `505faf2..HEAD` (commits `55ba4bf` backend, `a5fe38f` docs, `277de95` frontend, `37b28b6` "Version 4"). Both loop reviews (`backend-review.md`, `frontend-review.md`) are APPROVED. This step made no code changes: every check failed only on known baseline items or on environment limits listed below.

## Verification results (run in place)

| Check | Result |
|---|---|
| backend `npx tsc -p tsconfig.build.json --noEmit` | pass (exit 0) |
| backend full vitest | 259 passed, 7 failed, 3 files. 6 are the known skip-vote failures (5 in `skip-vote.test.ts`, 1 skip-vote case in `integration.test.ts`). The 7th is the known load-only timeout in `manager-mode.test.ts` ("automatically completes seasons", 5000 ms). No new failure. All `retention.test.ts` cases pass. |
| frontend `npm run typecheck` | pass |
| frontend `npx next build` | pass; routes include `/room/[roomCode]/retention` |
| frontend UI tests passing | `api-client`, `websocket-protocol`, `retention-ui`, `retention-overlay-ui`, `retained-panel-ui`, `auction-redesign-ui`, `recall-ui`, `skip-vote-ui`, `fixture-format-ui`, `manager-realtime` |
| frontend UI tests that cannot run here | `auction-ui` (needs Supabase JWT env, and Node strip-only mode rejects a TypeScript parameter property), `overview-ui` (cannot resolve `react` from its bundling location), `manager-mode-ui` (esbuild cannot import `.module.css`), `cups-ui`, `formations-ui`, `golden-boot-ui`, `secret-heroes-ui`, `trophy-viewer` (look for `.next/static/css`, which this Next build does not emit; CSS is under `.next/static/chunks`), `live-integration` (requires `RUN_LIVE_INTEGRATION=1` and a live backend). None of these files were modified in this range, and the failures are harness or environment errors that occur before any retention code runs. |

Running vitest rewrites `backend/test-results/*.pdf`; I restored them with `git checkout` so the tree stays clean.

## Changed files (75 files, +4225/-1003)

Backend:
- `domain/types.ts`, `modules/retention/retention.service.ts` (sequential state machine), `retention.ledger.ts` (new rows, turn rows, new event types)
- `modules/auction/{auction.engine,auction.schemas,squad.service}.ts`, `modules/rooms/{room-state,room.manager,room.routes,room.service}.ts`, `modules/teams/team.service.ts`
- `modules/fc26/{fc26.routes,fc26.positions}.ts` (own-draft flag, CDM/CM/CAM position groups)
- `types/database.generated.d.ts`, `supabase/types/database.types.ts`
- Docs: `backend/WEBSOCKET_PROTOCOL.md`, `backend/AUCTION_RULES.md`
- Tests: `backend/tests/retention.test.ts` (rewritten)
- New: migration and apply script (below)

Frontend:
- New route `app/room/[roomCode]/retention/page.tsx`; lobby page now shows `RetentionStatusCard` and redirects
- Retention components rewritten or added: `RetentionScreen`, `RetentionViews`, `RetentionStatusCard`, `RetentionTeamSwitcher`, `RetentionFilters`, `RetentionPlayerCard`, `RetainedPlayersPanel`, `RetentionAnnouncementOverlay(.tsx/.css)`
- Live auction redesign: `app/auction/[roomCode]/{page.tsx,auction.css}`, new `components/auction/{AuctionHeader,TeamPurseStrip,PlayerStage,BiddingPanel,ActivityFeed,SquadOverview,AuctionOverview}.tsx`
- Retained visibility: `shared/{AcquisitionBadge,PurseBreakdown}.tsx`, `TeamPanel`, `TeamQuickView`, `TeamViewDrawer`, `SquadFormationView`, `TeamResultCard`, `TransferTable`, `AuctionSettingsSummary`, `AppShell`, `PlayerAuctionCard`
- `lib/retention-announcements.ts`, `services/retention.service.ts`, `stores/auction.store.ts`, `types/backend.ts`
- Tests: `retention-ui`, `retention-overlay-ui`, `retained-panel-ui`, `auction-redesign-ui`, `retention-fixtures`, `ui-harness`

Also in "Version 4": edits to the FC26 CSV files and regenerated `backend/test-results/*.pdf`. These are outside the retention work.

## Migration (written, NOT applied to any database)

File: `supabase/migrations/20261002090000_retention_sequential.sql`. It is additive and idempotent. It does not modify or re-apply `20261001090000`.
- `auction_retentions`: adds `acquisition_type`, `retention_order`, `turn_id`, `confirmed_at`, `confirmed_by`. Widens the status check to `ACTIVE`/`CONFIRMED`/`FINALIZED`. Adds `unique(room_id, team_id, player_id)`. Adds a DB trigger that rejects a fourth retention per team per room.
- New table `auction_retention_turns` with `unique(room_id, team_id)`, `unique(room_id, turn_order)` and a unique `event_id`. RLS is on, privileges are revoked from `anon`/`authenticated` and granted to `service_role`.
- No FK to `auction_rooms`, as in the first migration (live rooms are file snapshots).

Apply steps (backend directory, `DATABASE_URL` set; the script reads `process.env.DATABASE_URL`):
1. Dry run (prints current schema only): `cd backend; node scripts/apply-retention-sequential-schema.mjs`
2. Apply: `node scripts/apply-retention-sequential-schema.mjs --apply`. This runs the SQL, verifies RLS and privileges, and registers version `20261002090000` through `supabase migration repair --status applied`. Set `SUPABASE_CLI` if the CLI is not on PATH.
3. Alternative: apply the SQL file through the Supabase power, then run `supabase migration repair 20261002090000 --status applied`.

Until the migration is applied, the write-behind ledger logs missing-column errors (42703/42P01) and swallows them. The room snapshot stays authoritative, so gameplay is unaffected.

## API and event changes

Commands (same WebSocket `commandSchema`, so `requestId` idempotency, `expectedSequence`, the per-room lock and CAS commit all apply):
- New: `START_RETENTION` (host), `CONFIRM_RETENTION` (active team), `SKIP_RETENTION` (active team, or host on its behalf), `REMOVE_RETENTION_PLAYER` (active team).
- Changed: `RETAIN_PLAYER` now adds a draft for the active team only. `FINALIZE_RETENTIONS` (host) requires phase `ALL_TEAMS_COMPLETED` and materializes squads and purses. `RESET_RETENTIONS` (host, lobby only) reverses a finalize and clears everything. `START_AUCTION` requires phase `FINALIZED` when retention is enabled.
- Join, leave and kick are rejected with `RETENTION_IN_PROGRESS` once retention has started, until the host resets.

Events: `RETENTION_STARTED`, `RETENTION_TURN_STARTED`, `RETENTION_PLAYER_RESERVED` and `RETENTION_PLAYER_RELEASED` (player id only, no team), `RETENTION_TEAM_CONFIRMED` (kind `RETAINED` or `SKIPPED`, unique `eventId` equal to the turn uuid, players, spend, remaining purse, next team), `RETENTION_ALL_COMPLETED` (per-team overview), and the existing `RETENTION_FINALIZED` and `RETENTION_RESET`. The old `PLAYER_RETAINED` event is removed.

`ROOM_STATE.retention` now carries: phase, order, active team, per-team turn status, progress, confirmed picks with snapshots, turns, `reservedPlayerIds` (no owner), `ownDraft` (only for the draft owner), `canAct`, `canSkipForActive`. `GET /api/rooms/:code/retention/players` hides confirmed picks and other teams' drafts and flags the caller's own drafts.

## How it fits the existing architecture

- Retention lives inside the `Room` aggregate and the room snapshot, so it uses the same CAS commit, idempotency receipts, hydration, and reconnect path as everything else. No new service or real-time channel.
- Commands go through `AuctionEngine.execute`. Events are built inside `RoomManager.mutate` and broadcast only after the commit. Each connection then receives a per-viewer `ROOM_STATE`, which is how drafts stay private.
- Auth is the existing per-manager model: the server resolves the acting team from `userId` and compares it with `activeTeamId`. The client never names a team.
- Money and squads change only at finalize. Drafts and confirmed picks deduct nothing until then, so nothing leaks through `players`, `soldPlayers`, `team.playerIds` or `spentCr`. With start 200 the result is 200/185/170/155 for 0/1/2/3 retained. Retained players become SOLD entries and are excluded from queue and recall.
- The frontend reads everything from `ROOM_STATE`. The overlay is driven only by backend events, with dedupe by event id and a per-room, per-user seen set in localStorage.
- Retention OFF is the unchanged path. Legacy persisted rooms are normalized on hydrate: `OPEN` becomes `NOT_STARTED` with picks converted to drafts through `removePicks` (no money lost), and `FINALIZED` stays `FINALIZED`.

## Where the plan deviated or has caveats

- No "Continue to Next Team" button. The backend advances automatically on confirm or skip, and the handover screen plus the global overlay show the next team (plan decision D1). `TEAM_COMPLETED` is a per-turn status, not a blocking room phase.
- Route is `/room/[roomCode]/retention` (the app keys routes by room code), not `/auction/:auctionId/retention`.
- After finalize the host lands on the lobby (`/room/[roomCode]`) and starts the auction from there.
- Reconnect freshness: an announcement older than 15 s is marked seen silently on reload. The page state is still correct.
- Minor display issue left as is: `/3` is hardcoded in `RetainedPlayersPanel.tsx` and `RetentionAnnouncementOverlay.tsx` instead of reading `retention.config.maxPerTeam`.
- Retention UI tests run against an in-memory fake server (`retention-fixtures.mjs`), so they prove rendering and wiring. Server rules are proven by `backend/tests/retention.test.ts`.
- Not verified in this environment: `auction-ui.mjs` (the auction page changed heavily) and the other scripts listed above. Run them where Supabase env and a CSS-emitting build exist, and do a manual end-to-end pass once the migration is applied.
