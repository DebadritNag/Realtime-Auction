# Review: live-room-persistence (commit 0460690)
Verdict: APPROVED. No blockers.

Evidence (read from diff and commit message; suites not re-run):
- Commit message records tsc OK, vitest 288 pass / 7 fail (known baseline), new live-room-repository.test.ts 26 pass.
- postgres-live.ts: create maps 23505 to ROOM_CODE_CONFLICT 409; commit is a single CAS UPDATE on code+sequence, zero rows gives VERSION_CONFLICT 409. Same codes/status as File/Memory. One row per room (code PK, room_id unique).
- State is stored as the full Room JSON (settings, retention, playerQueue round-trip). RoomManager hydrates on both recover() and findByCode paths. recover() uses listActive() (non-COMPLETED); app.ts still re-arms timers for those rooms. listRecoverable still returns completed rooms, so profile/Manager Mode work.
- Archive (completed-auction-archive.ts) is unchanged and the live repo writes only live_room_snapshots, so no duplicate keys or double data. loadManagerAuction uses findById and falls back to readCompletedAuction for old rooms.
- TTL purge deletes only LOBBY rows older than LIVE_ROOM_LOBBY_TTL_DAYS (default 14, 0 disables); first run 60 s after boot, timers unref'd and cleared on close. Startup fails fast with a clear message if the table is missing.
- Migration 20261003090000 is after 20261002090000, additive/idempotent (if not exists), RLS enabled, revoked from public/anon/authenticated, granted to service_role. Not applied.
- Env: STORAGE defaults to postgres in production, requires DATABASE_URL; .env.example, ENVIRONMENT.md, ARCHITECTURE.md, README updated. Tests use a fake Sql double, never the hosted DB.

Non-blocking notes: a purged LOBBY room still cached in memory would get VERSION_CONFLICT on next commit (rare, 14-day idle). Timers assume a single instance.
