# Implementation Plan: Restore Auction v2

Repo root (work in place, no worktree): `C:\Users\ASUS\projects\Realtime -Auction`. Commit locally, never push. No DB migration is required (see Decision D5).

## Findings (read from code)

- **Pool freshness (req 1).** The restored room stores only restored players (`buildRestoredRoom`: `players` = SOLD restored ones, `playerQueue: []`). The auctioned pool is built at `START_AUCTION` in `auction.engine.ts` (~l.99-110) from `fc26.list()` minus SOLD players, so the live catalog is already used. The preview (`restore.validate.ts` l.82-88), `catalogs()` in `restore.routes.ts` and the lobby pool route (`GET /api/rooms/:code/restore/pool`) also call `fc26.list()`. Staleness risk is only the catalog cache: `IndexedFc26Catalog.ensure()` (`fc26.catalog.ts` l.28-46) caches forever and is invalidated only by `importAll()`. `importAll()` runs at server boot (`server.ts` l.69-80) and via `POST /api/fc26/import`. Rows added to the DB by another process after the first `list()` stay hidden until restart. L. Openda (FC26_Underdogs.csv) and Neymar Jr (FC26_ATT.csv) are in the CSVs, so they load on the next boot import. There is no `created_at`/added-at on the catalog `Player` (the select at `fc26.catalog.ts` l.140 does not read one), and the snapshot carries no timestamp, so no reliable "new since snapshot" signal exists.
- **Retention (req 2).** `buildRestoredRoom` already sets `retention: { enabled: false }`, `RESTORE_LOCKED_SETTINGS` includes `retention`, and `requireEnabledLobby` rejects retention commands when disabled. Restored purchases carry `acquisitionType: 'RETENTION'` for display only, so nothing else should trigger the phase. Gaps: nothing asserts it end to end, the frontend gates retention UI on `settings.retention.enabled` only (`room/[roomCode]/page.tsx` l.119-168, redirect at l.64-68), `ongoingStatus` counts unclaimed teams toward `READY_TO_START` (`room-summary.ts`), and `retentionPhase(room)` is not forced OFF for restored rooms.
- **Ownership (req 3, 4).** `Team.userId` is the identity; `restoredTeamId` claim by id is already name-independent. The room JSON is the persisted document (`live_room_snapshots`), so an additive optional `Team` field persists with no migration. Hydration invariants (`squad.service.ts` l.12) require unique `userId`s.

## Decision D4: how the system knows which user owned which restored team

Evidence:
1. The snapshot (`restore.schema.ts`) has team names and players only; no user ids. The original room was never persisted in this system.
2. `profiles.default_team_name` (`supabase/docs/DATABASE_SCHEMA.md` l.17, `profile.routes.ts` PATCH) is a free-text, non-unique, user-editable preference. It is not a record of who played which room. Using it for authorization would let anyone set their default team name to "Ritzz FC" and capture the team.
3. `room_members.team_name` / `auction_rooms` exist in the documented base schema, but live rooms are persisted in `live_room_snapshots`, and the screenshot auction never went through the app. There is no row linking "Ritzz FC" to a user. `manager_tournament_teams` is Manager Mode data created from completed rooms; not applicable.

Conclusion: **no reliable stored link exists.** Implement host-side binding:
- The host binds each restored team to a registered user (search by username or display name) in the restore workflow before creating the room, and can edit bindings in the lobby. Binding is a reservation: only that user can claim that team, at join, regardless of the name typed.
- Fallback for unbound teams: the existing pick-a-team claim, unchanged.
- `profiles.default_team_name` is used only as a non-authoritative search hint (the search matches it, labelled as a suggestion); never auto-binds.

### Other decisions
- **D1 Pool.** Add `Fc26Catalog.refresh(maxAgeMs)`; call it in restore `catalogs()`, the restore pool route, and `START_AUCTION` for restored rooms only. Pool composition stays "catalog minus owned". No NEW badge (no reliable signal, D4-style evidence above); new players simply appear.
- **D2 Retention.** Belt and braces: server forces phase OFF and rejects retention commands for restored rooms; frontend never renders retention UI or redirects to `/retention` for restored rooms.
- **D3 Rename.** Name lives only in `Team.name` (single source for lobby, auction, squads, results, PDF, archive). The join body may carry `teamName`/logo for a restored claim; it renames the team (validated with `nameSchema`, case-insensitive unique among teams), never touches squad/purse/purchases. `room.restore.teams[].name` stays the original snapshot name and is exposed as `originalName` for the lobby ("was Ritzz FC").
- **D5 Storage.** `Team.reservedUserId?: string` (+ `reservedLabel?: string`, display name captured at bind time) in the room JSON. No migration. Profile lookup reads existing `public.profiles(id, username, display_name, default_team_name)` through a `ProfileDirectory` abstraction (Postgres impl using the existing `options.database` Sql; memory impl for tests).
- **D6 Binding rules.**
  - A user can be bound to at most one team (enforced at create and at bind; error `USER_ALREADY_BOUND`).
  - The host is bound implicitly to the host team and cannot be bound elsewhere.
  - Join by a bound user: auto-assigned to the reserved team (body `restoredTeamId` optional; if given and different -> 409 `RESERVED_FOR_YOU_ELSEWHERE`... use code `ALREADY_RESERVED_ANOTHER_TEAM`).
  - Join by anyone else targeting a reserved team -> 403 `TEAM_RESERVED`. A user with a reservation cannot claim a different team.
  - Self-leave frees the claim but keeps the reservation. Host release/kick frees the claim and clears the reservation (host intent). Host `bind` with `userId: null` unbinds; rebinding a currently claimed team requires release first (`TEAM_ALREADY_CLAIMED`).
  - Reservations are lobby-only edits. After START nothing changes ownership.
- **D7 Privacy.** `GET /api/rooms/:code` exposes per team only `reserved: boolean` and `reservedForYou: boolean` (computed from `request.auth.userId`), never user ids. Member state exposes `reservedLabel` (display name) to members. Search endpoint returns `{userId, username, displayName}`, min 3 chars, max 10 hits, rate limited, authenticated.

## Plan (three sequential FEATs; same files are not shared across FEATs except types)

- [ ] 1. FEAT-001 backend pool freshness + no-retention hardening.
      a. `fc26.catalog.ts`: add `refresh(maxAgeMs?: number): Promise<void>` to `Fc26Catalog` and `IndexedFc26Catalog` (record load time in `ensure()`, drop cache when older than `maxAgeMs`, default 10 000). Check other `Fc26Catalog` implementers/mocks with `grep "implements Fc26Catalog\|Fc26Catalog =" backend`.
      b. `restore.routes.ts`: `await fc26.refresh()` in `catalogs()` and the pool route. `auction.engine.ts` START_AUCTION: `if (room.restore) await fc26.refresh(0)` before `fc26.list()`.
      c. Retention: in `retention.service.ts` `retentionPhase` return `'OFF'` when `room.restore`; `requireEnabledLobby` throws `RETENTION_NOT_ENABLED` for restored rooms; `room-state.ts` `retentionState` reports `enabled:false`. `room-summary.ts` `ongoingStatus`: for restored rooms require no unclaimed team for `READY_TO_START`, else `WAITING_FOR_TEAMS`.
      d. Tests in `backend/tests/restore.test.ts` (new `describe('v2 pool and retention')`): add a player after the first `list()` through a catalog stub/`persist` path and show preview + pool + START include it; Openda and Neymar Jr ids from the catalog are in the remaining pool and excluded when owned by a restored team; START_RETENTION/FINALIZE reject, state `retention.enabled === false`, START works once all teams claimed with no retention step; a non-restored room still runs retention normally (existing retention tests unchanged).
      Files: `backend/src/modules/fc26/fc26.catalog.ts`, `backend/src/modules/restore/restore.routes.ts`, `backend/src/modules/auction/auction.engine.ts`, `backend/src/modules/retention/retention.service.ts`, `backend/src/modules/rooms/room-state.ts`, `backend/src/modules/rooms/room-summary.ts`, `backend/tests/restore.test.ts`.
      Verify: `cd backend; npx tsc -p tsconfig.build.json --noEmit` and `npx vitest run tests/restore.test.ts` pass.

- [ ] 2. FEAT-002 backend user binding and rename (depends on 1 only for the shared test file).
      a. `domain/types.ts` `Team`: add `reservedUserId?: string; reservedLabel?: string`. `RoomRestore.teams[]` unchanged.
      b. New `modules/restore/restore.profiles.ts`: `ProfileDirectory { search(q, limit); getMany(ids) }`, `PostgresProfileDirectory(sql)` (parameterized `ilike`, escape `%`/`_`, match username, display_name, default_team_name as hint), `MemoryProfileDirectory`. `AppOptions.profileDirectory?`; in `app.ts` default to Postgres impl when `options.database` exists, pass to `registerRestoreRoutes(app, manager, directory)`.
      c. `restore.schema.ts`: `restoreCreateBodySchema.bindings?: { teamName, userId }[]` (max 8, strict); new `restoreBindBodySchema { teamId: uuid, userId: string|null }`. `restore.claims.ts`: `bindTeam`, `unbindTeam`, `assertBindable(room, team, userId)`; make `releaseTeamClaim` keep the reservation, add `releaseAndUnbind` used by host release and KICK_MEMBER (`auction.engine.ts` l.246-247).
      d. `restore.build.ts`: apply bindings by normalized team name, reject unknown team, host team, duplicates (`USER_ALREADY_BOUND`), and unknown users (`PROFILE_NOT_FOUND` via directory.getMany); store `reservedLabel`. `restore.routes.ts`: create route resolves bindings; add `GET /api/restore/users?search=`, `POST /api/rooms/:code/restore/bind` (host, lobby, emits ROOM_UPDATED), release route uses `releaseAndUnbind`; include `reserved`/`reservedForYou` in `GET /api/rooms/:code` (`room.routes.ts` l.57-62) and create response.
      e. `room.service.ts` join (restored branch): body `restoredTeamId` optional; resolve the caller's reserved team first (auto-assign); apply D6 rules; apply optional `teamName`/logo as a rename (case-insensitive unique, lobby only; also allow rename when `own` already claimed); set `managerUsername`. `schemas/settings.ts` `restoredJoinSchema`: make `restoredTeamId` optional.
      f. `room-state.ts` `restoreState`: per team add `originalName`, `reservedLabel`, `reserved`; never ids. `squad.service.ts` invariants: reserved ids unique, not equal to another team's claimed `userId`, only on restored rooms.
      g. Tests (new `describe('v2 ownership')` in `backend/tests/restore.test.ts`, using `MemoryProfileDirectory`): bound user `u1` joins with `teamName: 'Ritz Slayers'` and no id -> gets the Ritzz FC team with squad size, retained/auction counts, purse unchanged and name `Ritz Slayers` in state, `/teams/:id`, results and after a restart (`ValidatingHydrator`); other user claiming that team by id -> `TEAM_RESERVED`; typing the old or new name changes nothing; same name collision -> `TEAM_NAME_TAKEN`; one user bound twice rejected; bound user claiming another team rejected; unbound fallback claim works; self-leave keeps reservation, host release clears it; non-host bind rejected; START works with all teams claimed and no retention; non-restored join unchanged.
      Files: `backend/src/domain/types.ts`, `backend/src/modules/restore/{restore.profiles.ts (new),restore.schema.ts,restore.claims.ts,restore.build.ts,restore.routes.ts}`, `backend/src/modules/rooms/{room.service.ts,room.routes.ts,room-state.ts}`, `backend/src/modules/auction/{auction.engine.ts,squad.service.ts}`, `backend/src/schemas/settings.ts`, `backend/src/app.ts`, `backend/tests/restore.test.ts`.
      Verify: `cd backend; npx tsc -p tsconfig.build.json --noEmit`; `npx vitest run tests/restore.test.ts`; then full `npx vitest run` (baseline: 6 skip-vote failures + load-only timeouts are known).

- [ ] 3. FEAT-003 frontend (read `frontend/AGENTS.md` and the relevant `frontend/node_modules/next/dist/docs/` guide first).
      a. `types/restore.ts`, `services/restore.service.ts`, `services/room.service.ts`, `types/backend.ts`: add `searchUsers`, `bind`, `bindings` in create payload, `reserved`/`reservedForYou`/`originalName`/`reservedLabel`, optional `restoredTeamId` with `teamName`.
      b. `components/restore/RestoreWorkflow.tsx`: per-team "Manager" control (user search by username/display name, shows chosen user, clear button; duplicates blocked client-side; host team shows "You"); send `bindings` on create; copy explaining "set this before sharing the code".
      c. `app/join/page.tsx`: when a team is `reservedForYou` show "Your team: <original name>" with an editable team name (prefilled) and Join (no picker); otherwise picker lists only unreserved unclaimed teams, reserved ones disabled "Reserved". `RestoreLobbyPanel.tsx`: show "was <originalName>", reserved label, host bind/unbind control via `restoreService.bind`.
      d. Retention never shown for restored rooms: `room/[roomCode]/page.tsx` gate `retentionEnabled` with `!restore`, skip the `/retention` redirect when `snapshot.restore`; guard `app/room/[roomCode]/retention` page if it exists.
      e. Pool panel: no NEW badge (documented); title text mentions that newly added database players are included.
      f. Tests: extend `frontend/tests/restore-ui.mjs` (existing stub/`ui-harness.mjs` pattern): workflow binding search + payload, join page reserved flow with a different team name, picker hides reserved teams, no retention UI in a restored lobby.
      Verify: `cd frontend; npm run typecheck`; `npx next build`; `node tests/restore-ui.mjs` via the existing runner used for `restore-ui` (see `package.json`/`tests/ui-harness.mjs`); UTF-8 scan of changed files (PowerShell: read bytes, `[Text.UTF8Encoding]::new($false,$true).GetString(...)` must not throw).

- [ ] 4. Convergence (workflow loop): full backend + frontend verification, UTF-8 scan of all changed files, final report (ownership rule and what the host must do before sharing the code, rename behavior, pool composition, retention handling, files, no migration, tests, production steps).

## Production steps to put in the final report
1. Deploy backend then frontend (no DB migration; nothing to apply).
2. Make sure the new CSV rows (Openda, Neymar Jr) are on the backend host; the backend imports them at boot, or call `POST /api/fc26/import` once. Rows inserted directly into the DB are picked up automatically at the next restore preview/create/START.
3. Host: Create Auction -> Restore ON -> pick the template -> for each team search and choose the registered user (e.g. Ritzz FC -> Debadrit Nag) -> create -> share the room code.
4. Managers open the join link while signed in with their own account; bound users are placed in their team automatically and may type a new team name; unbound teams are picked manually. Host starts once every team shows a manager. No retention step appears.

## Digest

Verified by reading (not run): baseline commands `cd backend; npx tsc -p tsconfig.build.json --noEmit`, `npx vitest run`; `cd frontend; npm run typecheck` (= `node tests/type-boundary.mjs`), `npx next build`; frontend tests are `.mjs` using `tests/ui-harness.mjs`. Tests have not been run by the planner.

| File | Block to change | Covering test |
|---|---|---|
| `backend/src/modules/fc26/fc26.catalog.ts` | `Fc26Catalog` interface; `IndexedFc26Catalog.ensure()` l.28-46 | `restore.test.ts` v2 pool |
| `backend/src/modules/restore/restore.routes.ts` | `catalogs()` l.45-53, pool route l.120+, create route, release route, new users/bind routes | `restore.test.ts` |
| `backend/src/modules/auction/auction.engine.ts` | START_AUCTION l.92-122; KICK_MEMBER l.244-250 | `restore.test.ts` |
| `backend/src/modules/retention/retention.service.ts` | `requireEnabledLobby` l.28; `retentionPhase` | `restore.test.ts`, existing retention tests |
| `backend/src/modules/rooms/room.service.ts` | `join` restored branch l.19-37 | `restore.test.ts` claims/ownership |
| `backend/src/modules/rooms/room.routes.ts` | `GET /api/rooms/:code` l.57-62, join route l.64-70 | `restore.test.ts` |
| `backend/src/modules/rooms/room-state.ts`, `room-summary.ts` | `restoreState` l.113; `ongoingStatus` | `restore.test.ts`, ongoing-auctions tests |
| `backend/src/modules/restore/restore.{build,claims,schema}.ts`, `schemas/settings.ts` l.46, `domain/types.ts` `Team`, `squad.service.ts` l.86-90, `app.ts` l.117-118 | as in FEAT-002 | `restore.test.ts` |
| `frontend/src/components/restore/RestoreWorkflow.tsx`, `RestoreLobbyPanel.tsx`, `RestorePoolPanel.tsx`, `app/join/page.tsx`, `app/room/[roomCode]/page.tsx` l.64-68,119-168, `services/{restore,room}.service.ts`, `types/restore.ts` | as in FEAT-003 | `frontend/tests/restore-ui.mjs` |
