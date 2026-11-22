# Semantic review: Live add-players to a running auction (PART 9)

Reviewed `2f90d56..HEAD` (bf75c76 backend, 8038460 frontend) plus uncommitted changes. Uncommitted changes are only the FEAT-002.json status/findings update and unrelated artifacts (PDFs, other task dirs). Suites were not re-run; I relied on the recorded evidence in FEAT-001/002 findings and commit messages.

**Verdict**: APPROVED

Live import is additive. It appends players to a tail queue (`room.addedQueue`) inside `RoomManager.mutate`, never touching the live lot, bids, timers, existing players or the existing random selection. Held additions for finished categories stay invisible until the host explicitly releases them.

Watch for: (1) the tail-queue model means additions always play after all regular waiting players, not "end of category" (a deliberate, documented consequence of the engine's random pot selection, plan section 1); (2) no integration run was repeated in this review, so confidence rests on recorded results (backend 19/19 new tests, tsc build clean, full suite only baseline failures; frontend 7 headless scripts and `npm run build` pass).

## High-level view

The engine selects players randomly by pot, so there is no flat queue to append to. The change keeps that algorithm untouched for regular players and adds a FIFO fallback that draws released additions only once no regular WAITING player remains. Existing player objects, array order, `active`, `endsAt`, `lastPot` counters and `playerQueue` are not read or written by the import.

Category handling classifies each pot at import time: ACTIVE (regular waiting, live lot, recall queue or released addition of that pot) gives FOLLOW; COMPLETED or absent gives HELD. Held players never activate and do not count as selectable, so a finished category is not silently reopened and the phase never moves backwards. The host introduces them with `RELEASE_POOL_ADDITIONS`.

The import runs in one `mutate` call: host and status checks, batchId idempotency with content hash (same hash replays, different hash gives 409), eligibility re-evaluated on the latest committed room (retained, live, sold, unsold, in pool, in file), then append and a single `PLAYER_POOL_UPDATED` event. A zero-add import emits nothing. Prices are computed server-side; client prices are ignored. Parsing happens before the lock, but eligibility never trusts it. `app.ts` skips `timers.schedule` for pool-only commits so the countdown is not re-armed.

Frontend notices come only from the server event, deduped per batchId and not triggered by reconnect snapshots. Host modal covers CSV, FC26 database and default pool, preview with reasons, IMPORT COMPLETED summary and a view action. NEW sits beside the retained UNDERDOG tag.

<details>
<summary>Issues (3)</summary>

1. **Tail ordering vs "end of category queue" (possible, informational)** — additions are ordered after all regular players rather than at the end of their own category; matches the plan and engine design, no change needed.
2. **RecallPlayersModal has no NEW badge (confirmed, non-blocking)** — intentional since it lists UNSOLD players; revisit only if a recalled imported player should keep a marker.
3. **Verification not re-run (confirmed)** — recorded results only; the baseline failures (helpers-pg-double.ts tsc error, skip-vote, load timeouts) are unchanged.

</details>

<details>
<summary>Details</summary>

### Acceptance coverage
Live lot, bid, bidder and countdown are untouched (no reads/writes of `active`/`nextPlayerAt`, timer reschedule guarded). Duplicate, sold, live, unsold and retained skips and invalid-row rejection with reasons are in `classify`. Host-only plus member check, LOBBY/COMPLETED rejected with 409, route `bodyLimit` 2 MB, 1.5M chars, 1000 rows, 10/min rate limit and strict zod body. `assertRoom` gained addedQueue and batch uniqueness invariants. Persistence relies on optional jsonb fields with no migration; `roomState.poolAdditions` is in the snapshot so refresh and reconnect preserve the pool. Archive and Manager Mode: imported players are ordinary `AuctionPlayer`s with valid ids and integer prices, and the tests include an archive case per the commit evidence.

### File map
Backend: `pool-import/*` (parser, service, routes, types, helpers), `auction.engine.ts`, `auction.schemas.ts`, `squad.service.ts`, `room-state.ts`, `domain/types.ts`, `pricing.ts`, `fc26.importer.ts`, `app.ts`, tests `live-add-players.test.ts`. Frontend: `AddPlayersModal`, `PoolUpdateNotice`, `HostAuctionControls`, `PlayerPoolSidebar`, `PlayerAuctionCard`, `UnderdogTag` (NewTag), store, services, types, headless tests.

</details>


Re-check (this pass): re-read pool-import.service.ts, pool-additions.ts and the engine/app.ts diffs. Import runs entirely inside manager.mutate, eligibility is re-classified on the latest room, replay is hash-checked, and the timer guard is limited to pool-only commits. Uncommitted types.ts additions (restore fields) belong to another workflow and do not affect Part 9. No blocking findings. Verdict stays APPROVED.
