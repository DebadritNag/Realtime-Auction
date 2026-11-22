# Implementation Plan: durable live auction rooms in Postgres

## Design decision

Add a new `PostgresLiveRoomRepository` backed by a **dedicated table `public.live_room_snapshots`**, one upserted row per room (code PK, `sequence`, `state jsonb`). Select it with `STORAGE=postgres`, which becomes the default when `NODE_ENV=production` (and `DATABASE_URL` is already mandatory there). `file` stays the default and `memory` stays available for local dev and tests.

Why not the existing `PostgresRoomRepository` (backend/src/repositories/postgres.ts) as is. I read it and it is not usable for live rooms:
1. It writes `auction_rooms`, `room_members`, `auction_pots`, `auction_pool`, `auction_bids`, `player_purchases`, `auction_runtime_snapshots` on every commit. `auction_pool.player_id` and the purchase/bid `player_id` columns reference `football_players` with real ids; live rooms use catalog/FC26/demo string ids that are not rows there. The archive resolves them through a `mapping` (external_id, fc26_player_id, stableId). The existing repo does not, so commits would fail or write wrong ids.
2. `archiveCompletedAuction` returns early if `auction_rooms` already has the room id. With creation-time persistence it would silently skip the archive and leave a pool whose ids differ from the archive's `mapping`. `readCompletedAuction` (Manager Mode) would then break. Making both paths coexist means rewriting the archive.
3. It writes one `auction_bids` row set per commit and runs a row-level diff in a transaction per bid (many statements per bid), and `auction_pool.id` is a hash uuid that conflicts with the archive's `randomUUID()` rows.
4. `listRecoverable` returns completed rooms too and `findByCode` throws `ROOM_RECOVERY_UNAVAILABLE` for rooms without a snapshot. Neither is wanted for restart recovery.
It stays in the repo untouched and unused (do not delete; out of scope).

The dedicated table leaves the completion archive, `readCompletedAuction`, `PostgresRetentionLedger` and `auction_runtime_snapshots` completely untouched, so Manager Mode and old archived rooms keep working. A bid commit becomes one single-row `UPDATE ... WHERE code=$1 AND sequence=$2`, which is atomic and gives VERSION_CONFLICT with no explicit transaction.

## Facts read from the code (drive the plan)
- `RoomRepository` (interfaces.ts): `create`, `findByCode`, `listRecoverable`, `commit(room, expectedSequence)`. Memory and File throw `ROOM_CODE_CONFLICT` (409) and `VERSION_CONFLICT` (409) via `requireThat`; the new repo must match codes and status.
- `RoomManager.recover()` (rooms/room.manager.ts) loads `listRecoverable()`, hydrates each with `ValidatingHydrator` (settings schema normalization, `normalizeLegacyRetention`, `assertRoom`), caches. `loadUnlocked` falls back to `findByCode`. `mutate` commits with `current.sequence`, and on failure reconciles via `findByCode`.
- `app.ts` lines ~64-66: after `manager.recover()` it calls `retentionLedger.sync(room)` for rooms with `retention` and `timers.schedule(room)` for every recovered room. Timers are therefore re-armed from persisted `active.endsAt` / `nextPlayerAt` as long as `listRecoverable` returns the active rooms. No change needed there.
- `server.ts` line ~77 picks the repository. `managerPrepareAuction` finds the room via `auctionRepository.listRecoverable()` then calls `archiveCompletedAuction`. `loadManagerAuction` and `profile.routes.ts` (`roomsFor`) also use `listRecoverable()` and expect **completed** rooms to be present. So `listRecoverable` must keep returning completed rooms (file/memory do). To keep startup cheap, add a separate method for startup (see item 1).
- Archive inserts `auction_rooms` etc. only when absent, so there is no duplicate risk as long as the live repo never touches those tables. Retention ledger tables have no FK to `auction_rooms` (migration comment), so they are independent of this change.
- Existing restart test: `backend/tests/recovery-auth-timers.test.ts` (File repo, new `RoomManager`, `recover()`, `fixture()` from `tests/helpers.ts`, which accepts a `RoomRepository`).
- Commands: `npx tsc -p tsconfig.build.json --noEmit` and `npx vitest run` in `backend/` (package.json scripts: `build` = tsc + verify-manager-pool, `test` = vitest run).

## Steps

- [ ] 1. Interface: add `listActive(): Promise<Room[]>` (non-COMPLETED rooms) to `RoomRepository`; implement in `MemoryRoomRepository` and `FileRoomRepository` (filter `status!=='COMPLETED'` over `listRecoverable()`). Add `findById(id)` and `listForUser(userId)` too, so consumers stop scanning everything: Memory/File filter `listRecoverable()`. Change `RoomManager.recover()` to use `listActive()` (returned list is what app.ts schedules timers for; completed rooms need no timers). Switch `server.ts managerPrepareAuction`, `loadManagerAuction` (param type `{findById}`; keep `listRecoverable` fallback signature compatible for tests that pass `{listRecoverable}` — keep it accepting either) and `profile.routes.ts roomsFor` to the new methods. Keep `RoomManager` and the interface minimal and repository-agnostic: the follow-up reconnect/presence feature builds on `recover`/`loadRoom`, so add no presence logic here.
  Files: backend/src/repositories/interfaces.ts, memory.ts, file.ts, src/modules/rooms/room.manager.ts, src/modules/manager-mode/auction-snapshot.repository.ts, src/modules/profile/profile.routes.ts, src/server.ts.
  Verify: `npx tsc -p tsconfig.build.json --noEmit`; `npx vitest run` shows no new failures (baseline: 6 skip-vote failures, load-only timeouts in cups/manager-mode/seasons).

- [ ] 2. Migration `supabase/migrations/20261003090000_live_room_snapshots.sql` (additive, idempotent, `begin; ... commit;`): 
  `create table if not exists public.live_room_snapshots (code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'), room_id uuid not null unique, host_user_id text not null, status text not null, sequence bigint not null check (sequence >= 1), state jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`; indexes on `(status, updated_at)` and `host_user_id`; `enable row level security`; `revoke all ... from public, anon, authenticated`; `grant all ... to service_role`. No FK to other tables (same rationale as `auction_retentions`). `host_user_id` is text (the domain `hostUserId` is a string; `auction_rooms.host_user_id` typing was not needed). Do NOT apply it.
  Files: supabase/migrations/20261003090000_live_room_snapshots.sql. Also add the table to `backend/src/types/database.generated.ts` only if that file lists tables and a test/typecheck requires it (check; otherwise skip).
  Verify: file review; the orchestrator applies it.

- [ ] 3. New `PostgresLiveRoomRepository` in `backend/src/repositories/postgres-live.ts` taking an `Sql`:
  - `create`: `insert ... (code, room_id, host_user_id, status, sequence, state)`; catch pg code `23505` -> `DomainError('ROOM_CODE_CONFLICT','Room code already exists.',409)`.
  - `commit(room, expected)`: `update public.live_room_snapshots set status, sequence=${room.sequence}, state=${sql.json(JSON.parse(JSON.stringify(room)))}, updated_at=now() where code=${room.code} and sequence=${expected} returning sequence`; zero rows -> `VERSION_CONFLICT` 409 `'Room version changed.'`. One statement, no transaction, upsert-by-update so history never grows.
  - `findByCode`: `select state ... where code=`, return `null` if absent. `findById`, `listForUser` (jsonb `state->'teams'` contains userId; use `exists (select 1 from jsonb_array_elements(state->'teams') t where t->>'userId'=$1)`), `listRecoverable` (all rows), `listActive` (`where status <> 'COMPLETED'`).
  - `purgeStale(lobbyTtlDays)`: `delete ... where status='LOBBY' and updated_at < now() - make_interval(days => $1)`; returns the deleted count; no-op when ttl <= 0.
  - Never log room state. JSON round-trip is lossless for Room (plain objects, numbers, strings; `JSON.parse(JSON.stringify())` already used by existing snapshots and by FileRoomRepository). Retention phase/turns/reservations and `playerQueue` are plain fields on Room, so they round-trip; assert this in tests with a retention room.
  - Reuse the existing `connectDatabase` pool (max 5, `statement_timeout` 10 s). Do not open a second pool.
  Files: backend/src/repositories/postgres-live.ts.
  Verify: item 5 tests.

- [ ] 4. Wiring and config. 
  - `env.ts`: `STORAGE` becomes `z.enum(['memory','file','postgres']).optional()`; after parse resolve `storage = STORAGE ?? (NODE_ENV==='production' ? 'postgres' : 'file')`; throw if `storage==='postgres'` and no `DATABASE_URL`; return it as `env.STORAGE` so callers keep using that name (check `readEnvironment` call sites/tests, `rg STORAGE backend`). Add `LIVE_ROOM_LOBBY_TTL_DAYS` (`z.coerce.number().int().min(0).default(14)`, 0 disables).
  - `server.ts`: `auctionRepository = env.STORAGE==='postgres' ? new PostgresLiveRoomRepository(managerDb!) : env.STORAGE==='file' ? new FileRoomRepository(env.DATA_DIR) : new MemoryRoomRepository()`. Log `[auction] storage=postgres` once. Add a cleanup timer: `setInterval(purge, 6h).unref()`, plus one run 60 s after boot (not at module load, never deletes anything but old LOBBY rows), cleared in `onClose`; errors are logged without state. Fail fast at boot with a clear message if the `live_room_snapshots` table is missing (`select 1 from public.live_room_snapshots limit 1` in a try; on code `42P01` log a fatal pointing at the migration and exit non-zero; otherwise the service would 500 on every create).
  Files: backend/src/config/env.ts, backend/src/server.ts.
  Verify: `npx tsc -p tsconfig.build.json --noEmit`; env unit assertions in item 5.

- [ ] 5. Tests (no hosted DB). Create `backend/tests/helpers-pg-double.ts`: a fake `Sql` tagged-template function backed by a `Map<code,row>` that recognizes the six statements from item 3 by their normalized text and enforces PK uniqueness (throws `{code:'23505'}`), the `sequence` predicate, `status<>'COMPLETED'`, LOBBY purge by `updated_at`, plus `sql.json` = identity. The fake must not accept unknown statements (throw) so SQL drift is caught. New `backend/tests/live-room-repository.test.ts`:
  1. Contract suite via `describe.each` over Memory, File (temp dir, removed after, as in recovery-auth-timers.test.ts), and Postgres+fake: create then `findByCode`; duplicate create -> `ROOM_CODE_CONFLICT`; stale commit -> `VERSION_CONFLICT`; `listRecoverable` includes COMPLETED; `listActive` excludes COMPLETED; `findById`; `listForUser`; returned objects are copies.
  2. Concurrent commit: two `commit(room2, 1)` with `Promise.all` -> exactly one resolves, one `VERSION_CONFLICT` (fake serializes statements the way Postgres row update does).
  3. Restart simulation using `fixture({}, repo)` from tests/helpers.ts: start auction, place bid, build a new `RoomManager` over the same repo, `recover()`, assert `active.currentBidUnits`, duplicate `requestId` returns `duplicate`, schedule a `TimerService` from `recover()` result with fake timers and assert the overdue timer settles once (mirror the existing test), and a retention-phase room (use the helper/setup from tests/retention.test.ts) keeps `retention` phase, turns and reservations; a legacy snapshot missing newer settings keys gains defaults through the hydrator.
  4. Archive with live repo: complete an auction on the Postgres+fake repo, then run `archiveCompletedAuction` against a recording `Sql` double and assert it inserts into `auction_rooms` exactly once and that the live repo never wrote to any table except `live_room_snapshots` (the double records table names). Second archive call is a no-op (existing early return). Also assert `loadManagerAuction` returns the live COMPLETED room via `findById`, and falls back to `readCompletedAuction` when the live row is absent (old rooms).
  5. `purgeStale`: old LOBBY row deleted, old ACTIVE/COMPLETED rows kept, ttl 0 deletes nothing.
  6. env: production without `STORAGE` resolves `postgres`; dev resolves `file`; `STORAGE=postgres` without `DATABASE_URL` throws.
  Files: backend/tests/helpers-pg-double.ts, backend/tests/live-room-repository.test.ts; update `tests/manager-mode`/other tests only if item 1's signature change breaks them (keep `loadManagerAuction` accepting `{listRecoverable}`).
  Verify: `npx vitest run tests/live-room-repository.test.ts tests/recovery-auth-timers.test.ts tests/retention.test.ts`, then full `npx vitest run` (only baseline failures allowed) and `npx tsc -p tsconfig.build.json --noEmit`.

- [ ] 6. Docs. Update backend/ENVIRONMENT.md and backend/.env.example (check actual location with `ls`; `ENVIRONMENT.md` and `.env.example` exist at backend/): `STORAGE` options and the production default, `DATABASE_URL` role (Manager Mode, FC26 catalog, and now live rooms), `LIVE_ROOM_LOBBY_TTL_DAYS`, `DATA_DIR` only for file mode. Add a short note to README.md (or ARCHITECTURE.md if present) that Render needs no persistent disk, live rooms live in `live_room_snapshots` (one row per room), completion still archives to `auction_rooms` & co, abandoned LOBBY rows are purged after N days, and that rooms created before this deploy (file/memory) are lost once, producing 404 ROOM_NOT_FOUND for old links.
  Verify: docs review; commit locally (`git add` named files only; do not push).

## Operational notes for the final report
- Migration to apply (orchestrator, via Supabase power on project dvhzbkehgnkhernboigi): `supabase/migrations/20261003090000_live_room_snapshots.sql`. Apply it **before** deploying the backend. It is additive and idempotent.
- Render env: `DATABASE_URL` already set; optionally set `STORAGE=postgres` explicitly (default in production anyway). Remove reliance on `DATA_DIR`/disk; `LIVE_ROOM_LOBBY_TTL_DAYS` optional.
- First deploy: file rooms vanish once; clients see 404 for pre-deploy codes (e.g. 7APGWD). After that, restarts keep rooms.
- Residual risks: single-instance assumption for timers (two instances would both fire timers; the sequence check keeps state consistent but does not coordinate timers); each bid rewrites the whole JSON state (grows with bids/receipts, fine for room sizes; a ~10 s statement_timeout bounds it); Supabase pooler cold starts add commit latency.

## Digest

| File | Block to change | Test | Verified |
|---|---|---|---|
| backend/src/repositories/interfaces.ts | `RoomRepository` (lines 7-12): add `listActive`, `findById`, `listForUser` | live-room-repository.test.ts | read |
| backend/src/repositories/memory.ts | `MemoryRoomRepository` class (methods at 8-17) | contract suite | read |
| backend/src/repositories/file.ts | `FileRoomRepository.listRecoverable` (line ~20); add the three methods | contract suite, recovery-auth-timers.test.ts | read |
| backend/src/repositories/postgres-live.ts | new | live-room-repository.test.ts | n/a |
| backend/src/repositories/postgres.ts | unchanged (unused for live rooms) | n/a | read |
| backend/src/modules/rooms/room.manager.ts | `recover()` lines 57-61 uses `listActive()` | restart simulation | read |
| backend/src/modules/manager-mode/auction-snapshot.repository.ts | `loadManagerAuction` lines 30-34 | archive/fallback test | read |
| backend/src/modules/manager-mode/completed-auction-archive.ts | unchanged; early return on existing `auction_rooms` id | archive test | read |
| backend/src/modules/profile/profile.routes.ts | `roomsFor` line 17 | existing profile tests | read |
| backend/src/config/env.ts | `STORAGE` line in `envSchema`, `readEnvironment` | env test | read |
| backend/src/server.ts | line ~77 repository selection, `managerPrepareAuction` line 83, onClose hook | typecheck | read |
| supabase/migrations/20261003090000_live_room_snapshots.sql | new; latest existing is 20261002090000 | applied by orchestrator | listed |
| backend/ENVIRONMENT.md, backend/.env.example, README.md | docs | n/a | files exist |

Build: `npx tsc -p tsconfig.build.json --noEmit` (backend/). Tests: `npx vitest run` (backend/). Baseline failures known from the brief: 6 skip-vote, load-only timeouts in cups/manager-mode/seasons. I did not run the suite in this planning step.

No FEAT decomposition: the items are one coherent storage change on a shared interface, so the existing implement/review loop will execute this plan sequentially.
