# Implementation Plan: PART 9, add players to an ongoing live auction

Baseline (verified by me): `cd backend; npx vitest run tests/recall.test.ts tests/fc26-import.test.ts tests/auction.test.ts` gives 56 passed. `npx tsc --noEmit` in backend has exactly one pre-existing error (`tests/helpers-pg-double.ts(15,5) TS2322`); do not add new ones. In `frontend`, `node tests/recall-ui.mjs` and `node tests/type-boundary.mjs` pass. A previous run reported 6 baseline `skip-vote` vitest failures plus load timeouts; I did not re-run the full suite.

## 0. How the engine really works (recorded before design)

Read from `backend/src/modules/auction/auction.engine.ts`, `room.manager.ts`, `squad.service.ts`, `room-state.ts`.

- **There is no flat ordered queue and no per-pot phase.** `START_AUCTION` loads every pool player into `room.players` with `status:'WAITING'`, sets `room.playerQueue = []`, and `activateNext` picks at random: group WAITING players by `potId`, apply the anti-streak rule (`lastPot`/`consecutivePotCount`; a pot seen twice in a row is excluded while other pots exist), pick a random pot, then a random player of that pot. Pots interleave. Default-pool rooms use pots `GK/DEF/MID/ATT`; FC26 rooms use `GK/CB/FB/MID/ATT` (`fc26.positions.potForPosition`; Underdogs keep the pot of their primary position, with `draftPool:'UNDERDOG'`, `playerTag:'UNDERDOG'`, `sourceCategory:'UNDERDOG'`).
- `room.playerQueue` is only an explicit FIFO used by the legacy `START_RECALL` round (unsold ids). It is empty in a normal round. `RECALL_PLAYERS` flips UNSOLD back to WAITING and the random selector picks them up again.
- A "round" ends when no WAITING player remains and the queue is empty. The room stays RUNNING with `active=null`; the host then uses `START_RECALL` or `END_AUCTION`.
- **"Category completed" (definition used here):** a pot is *completed* when the room has no regular WAITING player of that pot, the live lot (if any) is not of that pot, and no already-queued addition of that pot is waiting. A pot is *active* otherwise. A pot with no players in the room at all is "not in the auction" and is treated like completed.
- Mutations: every change goes through `RoomManager.mutate(code, fn)`. It runs under a per-room lock, clones the cached latest room, runs `fn`, bumps `sequence`, runs `assertRoom`, commits with an optimistic `sequence` check, then publishes events. If `fn` pushes no events nothing is committed. Because the lock serializes with bids and timers and `fn` sees the latest committed room, an import inside `mutate` cannot overwrite a concurrent bid.
- `RealtimeHub.broadcast` sends each event and then a full per-viewer `ROOM_STATE` to every subscribed socket. So any new field on `room.players` reaches all clients and reconnects through the snapshot. `app.ts` calls `timers.schedule(room)` on every commit (it clears and re-arms the same `endsAt`); this plan skips it for pool-only commits.
- `room.retention.picks` plus SOLD entries in `room.players` (materialized at finalize) mark retained players. `assertRoom` requires `basePriceUnits >= toUnits(minimumBasePriceCr)` and `SOLD <=> owned`.
- Commands with `requestId` store `fingerprint = JSON.stringify(command)` in `room.receipts`. A multi-MB CSV must not go through that path (snapshot bloat), so the CSV import is an HTTP endpoint with its own idempotency (`batchId` stored on the room).
- Fastify `bodyLimit` is 16 KB globally and WS `maxPayload` is 16 KB: the import routes need a per-route `bodyLimit`.
- There is no admin concept in the codebase (`grep -i admin` finds nothing). Host-only means `requireHost(room, userId)` (`room.hostUserId`).

## 1. Chosen append strategy

Given random pot selection, "append at the end" is implemented as a **tail queue**, leaving the existing selection untouched:

1. New players are added to `room.players` as `status:'WAITING'`, `round:0`, with `poolMeta` (see below), and their ids are appended in import order to a new `room.addedQueue: string[]`. Existing array order, `playerQueue`, `lastPot`, `consecutivePotCount`, `active`, `nextPlayerAt`, `receipts` are never touched.
2. `activateNext` draws randomly (existing algorithm, unchanged) from **regular** WAITING players only, meaning WAITING and not in `addedQueue`. Only when no regular WAITING player is left does it take the first `FOLLOW` entry of `addedQueue` (FIFO). So additions always come after every existing waiting player, and the distribution over existing players is identical to today.
3. At import time each new player gets `poolMeta.release`:
   - `FOLLOW` if its category is **active** (regular WAITING of that pot exists, or the live lot is of that pot, or a FOLLOW addition of that pot is queued). It is played automatically in the tail.
   - `HELD` if its category is **completed** or not in the auction. It stays WAITING but is invisible to selection and does not count as "waiting" for `planNext`, so the category is never silently reopened and the auction never moves backwards.
4. Host introduces HELD players with a new host command `RELEASE_POOL_ADDITIONS` (`payload.playerIds?` optional; omitted = all held). It flips HELD to FOLLOW (they keep their `addedQueue` position, so they play after everything regular). If the room is RUNNING, idle and `nextPlayerAt===null`, it calls `planNext` (same as `RECALL_PLAYERS`).
5. When a follower is activated it leaves `addedQueue`. A recalled imported player later is a regular WAITING player.
6. `END_AUCTION` already SKIPs WAITING players; also clear `addedQueue`.
7. Status gating: import allowed in `RUNNING` and `PAUSED`. `LOBBY` is rejected (409 `INVALID_STATE`, message: configure the pool in settings; `START_AUCTION` rebuilds `room.players` from the pool and would drop additions). `COMPLETED`/`CLOSED` rejected. Document this.

Per-player eligibility outcomes (identity is `player_id`): `INVALID` (rejected), `DUPLICATE_IN_FILE`, `RETAINED` (checked first, in `retention.picks`/`drafts`), `CURRENTLY_LIVE` (`room.active.playerId` or status ACTIVE), `SOLD` (status SOLD or in `purchases`), `ALREADY_UNSOLD` (status UNSOLD), `ALREADY_IN_POOL` (WAITING/SKIPPED, includes queued additions), else `ELIGIBLE`. Existing players are never modified.

Decisions I made where the task is silent (the coder should not revisit):
- A zero-add import commits nothing (no events, so `mutate` does not commit) and returns the summary; its `batchId` is not stored.
- Pricing follows the room's source: FC26 room -> `fc26BasePriceUnits({overall, draftPool}, threshold)`; DEFAULT room -> default tier price from `ovr` (same ladder as `csvRowToPlayer`: >=90:9, >=87:7, >=84:5, >=81:2, else 1 Cr) with `Math.max(..., toUnits(minimumBasePriceCr))`. Client `base_price_cr` is ignored. In a DEFAULT room an Underdog row keeps `playerTag` for the badge but is priced by the default ladder.
- Default-schema CSV into an FC26 room: pot from the `position` column when it is a known FC26 position (`isKnownPosition`); otherwise reject the row ("Cannot classify position"). FC26-schema CSV into a DEFAULT room: pot = `broadPosition` mapped to `GK/DEF/MID/ATT` (FWD -> ATT), `position:'FWD'` for ATT like `csvRowToPlayer`.
- Limits: CSV text <= 1,500,000 chars, <= 1000 data rows, `fileName` <= 120 chars (stored as a sanitized basename, never opened), route `bodyLimit` 2 MB, rate limit 10/min. No server path is accepted from clients.
- Underdog detection for uploaded FC26 CSV: `draft_pool` equal to `UNDERDOG` (case-insensitive) or a non-empty `underdog_tag`. Otherwise regular.

## 2. Data model and contracts

`backend/src/domain/types.ts`:
```ts
export interface PoolMeta { poolStatus: 'PENDING'; importBatchId: string; importedAt: number; importedBy: string;
  sourceFile: string; sourceCategory: string; release: 'FOLLOW' | 'HELD' }
// AuctionPlayer: poolMeta?: PoolMeta
export interface PoolImportRowResult { row: number; playerId: string; name: string; code: string; reason: string }
export interface PoolImportBatch { batchId: string; contentHash: string; at: number; by: string; sourceKind: 'CSV'|'FC26_DATABASE'|'DEFAULT_POOL';
  sourceFile: string; totalRecords: number; addedPlayerIds: string[]; categoryCounts: Record<string, number>; heldCount: number;
  skipped: PoolImportRowResult[]; rejected: PoolImportRowResult[] }  // lists capped at 500 each
// Room: addedQueue?: string[]; poolImports?: PoolImportBatch[]  (keep newest 100)
```
All optional, so old snapshots hydrate unchanged (no migration; `live_room_snapshots.state` is jsonb).

HTTP (new `backend/src/modules/auction/pool-import/pool-import.routes.ts`, registered in `app.ts` after `registerFc26Routes`):
- `POST /api/rooms/:code/pool-import/preview` and `/commit`. Body (zod `.strict()`): `{ source: 'CSV'|'FC26_DATABASE'|'DEFAULT_POOL', fileName?: string, csv?: string, playerIds?: string[<=500], potIds?: string[], search?: string, batchId?: uuid }` (`batchId` required for commit; CSV required for source CSV).
- Response `PoolImportReport`: `{ mode:'PREVIEW'|'COMMIT', batchId?, duplicate?: boolean, sequence, totals:{ totalRecords, eligible, added, skipped, rejected, byReason: Record<string,number> }, rows:[{ row, playerId, name, positions?, ovr?, potId?, categoryState?:'ACTIVE'|'COMPLETED'|'NOT_IN_AUCTION', basePriceCr?, underdog?, status:'ELIGIBLE'|'SKIPPED'|'REJECTED', code, reason }] }` (rows capped at 1000). Whole-file problems (missing required headers, too large, too many rows, empty) are 400 with a clear code and message listing accepted columns.
- Accepted columns: FC26 schema requires `player_id, player_positions, overall` and `short_name` or `long_name`; optional `potential, nationality_name, club_name, league_name, age, preferred_foot, pace, shooting, passing, dribbling, defending, physic, player_face_url, draft_pool, underdog_tag`. Default schema requires `player_id, name, overall` and `auction_group` (GK/DEF/MID/ATT) or `position`; optional `club, nationality, age, preferred_foot, image_url, pace..physical, secondary_positions, league, rating_tier`. The schema is detected from the header (`player_positions` present = FC26).
- Preview never changes state. Commit re-parses and re-validates inside `manager.mutate`; nothing from the preview is trusted.

Event (appended in the same commit, existing naming style): `PLAYER_POOL_UPDATED` payload `{ auctionId: room.id, roomCode, batchId, addedCount, addedPlayerIds, addedPlayers:[{playerId, category, releaseState}], categoryCounts, heldCount, importedAt }`. Host release emits `POOL_ADDITIONS_RELEASED` `{ playerIds, count }`.

`roomState` additions: `poolAdditions: { pendingCount, followCount, heldCount, held:[{playerId,potId}], batches:[{batchId, at, addedCount, categoryCounts, sourceFile, importedBy}] (newest 20, no row lists) }`; host viewer additionally gets `skipped`/`rejected` lists per batch. `players[].poolMeta` is exposed via `publicPlayer` (spread already carries it). `playerQueueSummary` gains `heldAdditions`.

## 3. Ordered items

- [ ] 1. **Pricing and FC26 parser extraction (behavior-preserving).** Add `defaultPoolBasePriceCr(ovr)` to `backend/src/domain/pricing.ts` and use it in the fallback of `csvRowToPlayer`. In `fc26.importer.ts` export the row validation (`rowSchema` as `fc26RowSchema`) and `toRecord` (as `fc26RecordFromEntry`) so an uploaded row can be turned into a `Player` with the exact existing mapping. No logic change.
  Files: `backend/src/domain/pricing.ts`, `backend/src/modules/players/player.service.ts`, `backend/src/modules/fc26/fc26.importer.ts`
  Verify: `cd backend; npx vitest run tests/fc26-import.test.ts tests/fc26-pricing.test.ts tests/default-pool.test.ts` pass unchanged.

- [ ] 2. **Domain model, selection helpers, engine changes.** Add the types in section 2. Create `backend/src/modules/auction/pool-import/pool-additions.ts` with pure helpers: `isQueued(room,id)`, `isHeld(room,player)`, `regularWaiting(room)`, `followIds(room)`, `hasSelectable(room)` (playerQueue, regular WAITING, or FOLLOW), `categoryState(room, potId)`. Update `auction.engine.ts`: `planNext`, the `VOTE_SKIP` auto-advance check (line ~83) and the `START_RECALL` guard (line ~168) use `hasSelectable` / regular waiting; `activateNext` normal branch draws from regular WAITING only, falls back to the first FOLLOW id in `addedQueue` (FIFO, still updating `lastPot`/`consecutivePotCount`), removes the activated id from `addedQueue`, and for held-only keeps `NO_WAITING_PLAYERS` with a message mentioning additions awaiting release; `END_AUCTION` also clears `addedQueue`; add host command `RELEASE_POOL_ADDITIONS` to `auction.schemas.ts` (payload `{...common, playerIds?: string[1..2000]}`) and the engine switch (RUNNING/PAUSED only; `NO_HELD_ADDITIONS` 409 when nothing to release; unknown or non-held id 409 `PLAYER_NOT_RELEASABLE`; emits `POOL_ADDITIONS_RELEASED`; `planNext` when RUNNING, idle, `nextPlayerAt===null`). Extend `assertRoom` in `squad.service.ts`: `addedQueue` ids unique, exist, WAITING, carry `poolMeta`, not in `playerQueue`; `poolImports` batch ids unique. Update `room-summary.ts` `remainingIds` only if needed so held players do not look like remaining auction work (WAITING ids are counted there today; keep counting them, held are still pending).
  Files: `backend/src/domain/types.ts`, `backend/src/modules/auction/pool-import/pool-additions.ts`, `backend/src/modules/auction/auction.engine.ts`, `backend/src/modules/auction/auction.schemas.ts`, `backend/src/modules/auction/squad.service.ts`
  Verify: `npx vitest run tests/auction.test.ts tests/recall.test.ts tests/skip-vote.test.ts tests/squad.test.ts tests/retention.test.ts` (skip-vote baseline failures only), plus new engine tests in item 5.

- [ ] 3. **Import service, parsing, validation, commit.** Create `pool-import.types.ts`, `pool-import.parser.ts` (schema detection, per-row validation and mapping to `Player` incl. server-computed price and pot, `fileName` sanitization, limits; reuse `parseCsv`, `fc26RowSchema`, `fc26RecordFromEntry`, `isKnownPosition`, `potForPosition`, `broadPosition`) and `pool-import.service.ts`: `preview(code,userId,input)` (reads room via `manager.loadRoom`, `requireHost`, status check, builds the report, no mutation) and `commit(code,userId,input)`. Candidates for `FC26_DATABASE` come from `manager.fc26.get/search` and for `DEFAULT_POOL` from `manager.players.listPlayerPool({potIds,playerIds})`, always re-priced with the room-source rule. All async resolution and CSV parsing happen before the lock; `manager.mutate` then does: `requireHost`, status RUNNING/PAUSED, idempotency (existing `batchId` with equal `contentHash` returns the stored report with `duplicate:true` and pushes no events; same `batchId` with a different hash is 409 `IDEMPOTENCY_CONFLICT`), eligibility classification against the latest room, category state computed once from the pre-import room, append players and `addedQueue`, push the batch (cap 100), push `PLAYER_POOL_UPDATED` only if at least one player was added. It must not read or write `room.active`, `nextPlayerAt`, `lastPot`, `consecutivePotCount`, `playerQueue` or existing player objects, and must not call `planNext`.
  Files: `backend/src/modules/auction/pool-import/pool-import.{types,parser,service}.ts`
  Verify: `npx vitest run tests/live-add-players.test.ts` (item 5).

- [ ] 4. **Routes, wiring, state projection, timer guard, docs.** Add `pool-import.routes.ts` (zod strict body, route-level `bodyLimit: 2 * 1024 * 1024`, rate limit 10/min, auth from the existing `request.auth`), register it in `app.ts` with the shared `manager` and `manager.fc26`. In the `manager.subscribe` callback in `app.ts`, skip `timers.schedule(room)` when every event type is `PLAYER_POOL_UPDATED` (the timer is already armed for the unchanged `endsAt`/`nextPlayerAt`). Add `poolAdditions` and `playerQueueSummary.heldAdditions` to `roomState` in `room-state.ts`. Update `backend/WEBSOCKET_PROTOCOL.md` (event, command, HTTP endpoints, columns, status gating) and add root `LIVE_ADD_PLAYERS.md` (strategy, categories, release workflow, limits, no migration required).
  Files: `backend/src/modules/auction/pool-import/pool-import.routes.ts`, `backend/src/app.ts`, `backend/src/modules/rooms/room-state.ts`, `backend/WEBSOCKET_PROTOCOL.md`, `LIVE_ADD_PLAYERS.md`
  Verify: `npx tsc -p tsconfig.build.json --noEmit` clean; `npx vitest run tests/live-add-players.test.ts tests/realtime-protocol.test.ts`.

- [ ] 5. **Backend tests** in `backend/tests/live-add-players.test.ts` (use `fixture()` from `tests/helpers.ts` with `playerPoolSource:'FC26'` and a `MemoryFc26Catalog` built from `tests/fixtures/fc26`, stub `Math.random` for deterministic selection; reuse `FakeLiveSql` from `tests/helpers-pg-double.ts` and the restart pattern from `tests/restart-recovery.test.ts`; reuse the app/socket patterns from `tests/realtime-protocol.test.ts` and `tests/recovery-auth-timers.test.ts`). Cover every acceptance item:
  - live import with a placed bid: `room.active` deep-equal before/after (playerId, `activationId`, `endsAt`, bid, bidder), budgets, purchases, `bids`, `playerHistory` unchanged; existing players keep array order and are deep-equal; new players WAITING with full `poolMeta` and correct `basePriceUnits` (Underdog 1 Cr, >=90 5 Cr, else 3 Cr; client price ignored);
  - duplicates: in-file, in-pool, sold, live, unsold, retained (finalized retention room), invalid rows with reasons; counts in the report; `assertRoom` passes;
  - category: FOLLOW for an active pot, HELD for a drained pot and for a pot absent from the room, no category reopened (`NEXT_PLAYER` after the round does not activate a held player; round stays exhausted; `START_RECALL` still works); `RELEASE_POOL_ADDITIONS` then activates them, host-only, idempotent via requestId;
  - order: after the live lot resolves, activations are existing players first (any random order), then additions in import order; `lastPot` logic untouched while regular players remain;
  - concurrency: `Promise.all([PLACE_BID, commit])` in both orders keeps the bid and adds the players; two simultaneous commits of the same CSV add once; same `batchId` replay returns `duplicate:true` with no new sequence; a player sold/activated between preview and commit is skipped at commit; stale preview is not trusted;
  - permissions and status: non-host 403 `HOST_REQUIRED` on preview and commit, non-member 403, LOBBY/COMPLETED 409, oversize/too many rows/missing headers 400, no client path accepted;
  - persistence: with `PostgresLiveRoomRepository` over `FakeLiveSql`, a new `RoomManager` (server restart) rehydrates `players`, `addedQueue`, `poolImports`, and `roomState` for a reconnecting member includes the additions;
  - realtime: a connected member and the host both receive `PLAYER_POOL_UPDATED` followed by `ROOM_STATE` at the same sequence; `timers.schedule` is not called for a pool-only commit and the lot still resolves at the original `endsAt` through `engine.onTimer`;
  - archive/Manager Mode: after the auction completes with imported players (some sold), `archiveCompletedAuction` (see `tests/live-room-repository.test.ts` for the double, or assert the produced `football_players`/`auction_pool` rows) gets valid ids, positions, finite integer prices; the Manager Mode snapshot mapping accepts them.
  Files: `backend/tests/live-add-players.test.ts` (and small additions to `backend/tests/helpers.ts` only if needed)
  Verify: `cd backend; npx vitest run tests/live-add-players.test.ts` passes; then `npx vitest run` shows no new failures versus the baseline above; `npx tsc -p tsconfig.build.json --noEmit` clean.

- [ ] 6. **Frontend types, service, store** (read `frontend/AGENTS.md` and the relevant `frontend/node_modules/next/dist/docs/` client-component guidance before touching `page.tsx`; only a small prop wiring there). `types/backend.ts`: `PlayerDTO.poolMeta?`, `RoomStateDTO.poolAdditions?`, payload types `PLAYER_POOL_UPDATED` and `POOL_ADDITIONS_RELEASED`, add both names to the `names` list in `parseServerEvent`, add `RELEASE_POOL_ADDITIONS` to `ClientCommand`. `types/index.ts` `Player`: `isNew?`, `poolBatchId?`, `releaseState?`. `services/contract.ts` `mapPlayer` maps them (`isNew` = `poolMeta` present and status waiting). New `services/pool-import.service.ts` calling `api.post` for preview/commit with a generated `batchId` (`crypto.randomUUID()`). `stores/auction.store.ts`: on `PLAYER_POOL_UPDATED` (only after it arrives from the server) set `poolNotice {batchId,count,at}` deduped by `batchId` and sequence; never touch `activePlayer`, `currentBid`, `endsAt`; `dismissPoolNotice`; the snapshot already carries the new players so reconnect works without the event.
  Files: `frontend/src/types/backend.ts`, `frontend/src/types/index.ts`, `frontend/src/services/contract.ts`, `frontend/src/services/pool-import.service.ts`, `frontend/src/stores/auction.store.ts`
  Verify: `cd frontend; node tests/type-boundary.mjs`.

- [ ] 7. **Frontend UI.** Add `NewTag` next to `UnderdogTag` in `components/shared/UnderdogTag.tsx` (`data-testid="new-tag"`, label NEW; shown while a player is waiting; Underdog tag still rendered). Render it in `PlayerPoolSidebar.tsx` (plus a NEW filter chip), `RecallPlayersModal.tsx`, `PlayerAuctionCard.tsx` and any other upcoming/queue list that already renders `UnderdogTag`. New `components/auction/AddPlayersModal.tsx` (uses `ui/Modal`): choose source (Upload CSV with a client-side size check and `FileReader`, FC26 database, Default pool), accepted-columns help text, Preview table with status badges and reasons, Confirm, then the summary panel: `IMPORT COMPLETED`, Total CSV records, Successfully added, Skipped as duplicates, Rejected, list of skipped/rejected with reasons, and a "View new players" button. New `components/auction/PoolUpdateNotice.tsx` (non-blocking, auto-dismiss, text `"{N} new players have been added to the auction pool."` or singular, button "View" opening a list of the batch's players). `HostAuctionControls.tsx`: optional props `canAddPlayers`, `heldAdditions`; button `+ ADD PLAYERS TO AUCTION` (enabled when synced and RUNNING/PAUSED) opening the modal, and `Release held players (N)` that sends `RELEASE_POOL_ADDITIONS` after a `ConfirmDialog`. Wire props in `app/auction/[roomCode]/page.tsx` and mount `PoolUpdateNotice` for all members. Existing props stay optional so `tests/recall-ui.mjs` keeps working.
  Files: `frontend/src/components/shared/UnderdogTag.tsx`, `frontend/src/components/auction/{AddPlayersModal,PoolUpdateNotice,HostAuctionControls,PlayerPoolSidebar,RecallPlayersModal,PlayerAuctionCard}.tsx`, `frontend/src/app/auction/[roomCode]/page.tsx`
  Verify: `node tests/type-boundary.mjs`; `node tests/recall-ui.mjs`; `node tests/auction-redesign-ui.mjs`.

- [ ] 8. **Frontend tests** (headless pattern of `tests/recall-ui.mjs` + `tests/ui-harness.mjs`; offline, stub `webSocketService.send` and the pool-import service):
  `frontend/tests/pool-import-ui.mjs`: host sees `+ ADD PLAYERS TO AUCTION`, non-host does not; preview shows eligible/skipped/rejected rows with reasons; confirm sends exactly one commit; summary shows `IMPORT COMPLETED` with counts and lists; error from server shown as alert; NEW badge beside a new player and UNDERDOG still shown; release button sends `RELEASE_POOL_ADDITIONS`.
  `frontend/tests/pool-import-store.mjs` (pattern of `websocket-protocol.mjs`): feeding `ROOM_STATE` then `PLAYER_POOL_UPDATED` sets the notice only once per `batchId` (replay and reconnect `ROOM_STATE` do not re-notify), upcoming players include the new ones from the snapshot, and `activePlayer`, `currentBid`, `endsAt`, `highestBidder` are unchanged; `parseServerEvent` accepts the new event names.
  Files: `frontend/tests/pool-import-ui.mjs`, `frontend/tests/pool-import-store.mjs`
  Verify: `cd frontend; node tests/pool-import-ui.mjs; node tests/pool-import-store.mjs; node tests/type-boundary.mjs; node tests/websocket-protocol.mjs; node tests/reconnect-protocol.mjs`; one `npm run build` at the end of the loop.

## 4. Migration

None. All new state lives in the existing `live_room_snapshots.state` jsonb. The completion archive writes `football_players` and `auction_pool` rows from `room.players`; imported players need no new columns. If the coder finds a real constraint failure while testing the archive, add an additive idempotent file after `supabase/migrations/20261004090000_*` and report the exact apply steps; do not apply it.

## Digest

Work is done in place on `master` (base `2f90d56`); commit locally, never push; do not touch the untracked `.agents/tasks/continue-rejoin-auction/*`.

| File | Block to change (read) | Covered by | Verified |
|---|---|---|---|
| `backend/src/domain/pricing.ts` | add `defaultPoolBasePriceCr(ovr)` next to `fc26BasePriceUnits(player, threshold)` | `fc26-pricing.test.ts`, `default-pool.test.ts` | file read; tests pass today |
| `backend/src/modules/players/player.service.ts` | `csvRowToPlayer`: `basePriceCr` fallback ladder (ovr>=90?9:>=87?7:>=84?5:>=81?2:1) | `default-pool.test.ts` | read |
| `backend/src/modules/fc26/fc26.importer.ts` | `rowSchema` (const), `toRecord(winner, sources, threshold)` (function) become exported | `fc26-import.test.ts` | read; 56 tests incl. this file pass |
| `backend/src/domain/types.ts` | `AuctionPlayer`, `Room` interfaces | all | read |
| `backend/src/modules/auction/auction.engine.ts` | line ~83 `room.players.some(WAITING)` in VOTE_SKIP; `case 'START_RECALL'` guard (~168); `case 'END_AUCTION'` (~207); `planNext` (~256); `activateNext` normal branch (~270); new `case 'RELEASE_POOL_ADDITIONS'` modelled on `case 'RECALL_PLAYERS'` | `auction.test.ts`, `recall.test.ts`, `skip-vote.test.ts`, new tests | read; auction/recall pass today |
| `backend/src/modules/auction/auction.schemas.ts` | `commandSchema` discriminated union (add one host variant with optional `playerIds`) | `realtime-protocol.test.ts` | read |
| `backend/src/modules/auction/squad.service.ts` | `assertRoom`, after the `playerQueue` invariants (~line 27) | new tests | read |
| `backend/src/modules/rooms/room-state.ts` | `roomState` return object (`playerQueue`, `playerQueueSummary`, `players`) | new tests | read |
| `backend/src/modules/rooms/room.manager.ts` | no change; `mutate` (lock, latest clone, optimistic commit, publish) is the only write path used | new tests | read |
| `backend/src/modules/rooms/room.service.ts` | no change; `requireHost`, `requireMember` reused | new tests | read |
| `backend/src/app.ts` | `manager.subscribe` callback calling `timers.schedule(room)`; `registerFc26Routes(app, manager.fc26, manager)` line; global `bodyLimit: 16 * 1024` | new tests | read via grep |
| `backend/src/realtime/hub.ts` | no change; `broadcast` sends events then `ROOM_STATE` per viewer | new realtime test | read |
| `backend/src/modules/manager-mode/completed-auction-archive.ts` | no change expected; reads `room.players[*].id/subPosition/position/basePriceUnits/stats` | new archive test | read |
| `frontend/src/types/backend.ts` | `PlayerDTO`, `ClientCommand`, `Payloads`, `names` array in `parseServerEvent` (unknown event names return `null`, so both new names must be added) | `pool-import-store.mjs` | read |
| `frontend/src/types/index.ts` | `Player` interface | type-boundary | read |
| `frontend/src/services/contract.ts` | `mapPlayer` | store test | read |
| `frontend/src/stores/auction.store.ts` | `handleServerEvent` chain (add branch), `SEQUENCE_EXEMPT`, `initial` | `pool-import-store.mjs` | read |
| `frontend/src/components/auction/HostAuctionControls.tsx` | props interface and the button row | `recall-ui.mjs`, `pool-import-ui.mjs` | read; recall-ui passes today |
| `frontend/src/components/auction/PlayerPoolSidebar.tsx`, `RecallPlayersModal.tsx`, `shared/UnderdogTag.tsx` | add `NewTag`, render beside `UnderdogTag` | UI tests | read (sidebar partially) |
| `frontend/src/app/auction/[roomCode]/page.tsx` | `<HostAuctionControls .../>` at ~line 235 inside `{isHost && ...}`; `PlayerPoolSidebar` at ~272 and ~373 | UI tests | read |

Commands: backend `cd backend; npx vitest run <files>`, `npx tsc -p tsconfig.build.json --noEmit` (full `tsc --noEmit` has the one baseline error); frontend `cd frontend; node tests/<name>.mjs`, `node tests/type-boundary.mjs`, `npm run build`. Frontend tests need Chrome (`chromium.launch({channel:'chrome'})`) and `backend/node_modules/esbuild`.

