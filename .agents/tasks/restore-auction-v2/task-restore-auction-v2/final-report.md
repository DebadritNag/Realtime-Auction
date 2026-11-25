# FINAL REPORT: restore-auction-v2 (iteration 2: verdict APPROVED, no code changes)

## Team-to-user ownership
- No persisted link exists between a restored team and a user. The snapshot has only team names and players, and `profiles.default_team_name` is an editable, non-unique preference, so using it would let anyone claim "Ritzz FC" by setting it.
- Therefore the host binds registered users to restored teams in the restore workflow (Create Auction, Restore ON, "Manager for each team") before creating the room. The lobby also lets the host bind or remove a manager on unclaimed non-host teams.
- A binding is a reservation: only that user can claim that team at join, whatever name they type. Bound users are placed in their team automatically.
- Unbound teams use the existing pick-a-team claim. `default_team_name` is only a search hint and never auto-binds.
- Rules: a user is bound to at most one team (`USER_ALREADY_BOUND`); the host team is not bindable; others get `TEAM_RESERVED` (403) on a reserved team; a reserved user claiming another team gets `ALREADY_RESERVED_ANOTHER_TEAM` (409). Self-leave keeps the reservation; host release or kick clears it.
- The host must bind users BEFORE sharing the room code, otherwise any joiner can pick an unbound team.

## Rename
A bound user can join (or re-join) with a new team name, e.g. Ritzz FC to Ritz Slayers. Only `Team.name` changes (case-insensitive unique, `TEAM_NAME_TAKEN` on collision). Squad, purse and purchases stay as in the snapshot. The user identity stays the same (Debadrit Nag). The new name shows in lobby, auction, team page, results and after restart. The lobby shows "was <original name>".

## Pool composition
Catalog minus players owned by restored teams. `Fc26Catalog.refresh()` is called by restore preview/create, the lobby pool route and START of restored rooms, so players added to the DB later (e.g. L. Openda, Neymar Jr) are included. No NEW badge, since no reliable "added since snapshot" signal exists; the pool panel says newly added database players are included.

## Retention
Never for restored rooms: server phase forced OFF, retention commands rejected with `RETENTION_NOT_ENABLED`, state reports `retention.enabled=false`. The frontend hides retention UI, skips the `/retention` redirect, and the retention page redirects restored rooms to the lobby. START works once all teams are claimed.

## Files changed (a70557e..HEAD, 31 files)
Backend: `domain/types.ts`, `fc26/fc26.catalog.ts`, `restore/{restore.profiles.ts (new), restore.schema.ts, restore.claims.ts, restore.build.ts, restore.routes.ts}`, `rooms/{room.service.ts, room.routes.ts, room-state.ts, room-summary.ts}`, `auction/{auction.engine.ts, squad.service.ts}`, `retention/retention.service.ts`, `schemas/settings.ts`, `app.ts`, `tests/restore.test.ts`.
Frontend: `types/{restore,backend}.ts`, `services/{restore,room}.service.ts`, `components/restore/{RestoreWorkflow,RestoreLobbyPanel,RestorePoolPanel}.tsx`, `app/join/page.tsx`, `app/room/[roomCode]/page.tsx`, retention page, `tests/restore-ui.mjs`.
Unrelated modified files left untouched: `backend/test-results/*.pdf`.

## Migrations
None. Reservations live in the room JSON (`live_room_snapshots`). Nothing to apply.

## Tests and results (iteration 1, HEAD ea4df32)
- Backend `npx tsc -p tsconfig.build.json --noEmit`: pass.
- Backend `npx vitest run`: 387 pass, 7 fail (baseline: 6 skip-vote incl. integration skip-vote, plus manager-mode load timeout). A second run under load showed extra failures only in cups, golden-boot, realtime-protocol, manager-mode (load timeouts, unrelated to restore). `tests/restore.test.ts` passes 37/37.
- Frontend `npm run typecheck`: pass. `npx next build`: pass. `node tests/restore-ui.mjs`: pass (binding search and payload, reserved join as "Ritz Slayers", reserved teams disabled in picker, lobby original name/bind, no retention card, no horizontal scroll at 375/768/1280).
- Not run: auction-ui, overview-ui, retention-ui, retention-overlay-ui, formations-ui (fail on clean HEAD).
- UTF-8 strict decode scan of 31 changed files: 0 bad.

## Requirement check
1. Restore + newly added DB players in the pool: covered by backend v2 pool tests.
2. Teams keep their identity across Create, Lobby, Auction: covered by v2 ownership tests (including restart hydration).
3. Same user, different team name, new name shown, old auction state kept: covered by backend and UI tests.
4. No retention in restored rooms: covered by backend and UI tests.

## Production steps
1. Deploy backend, then frontend. No DB migration.
2. Ensure the new CSV rows (Openda, Neymar Jr) are on the backend host; they import at boot, or call `POST /api/fc26/import` once. Rows inserted directly into the DB appear at the next restore preview/create/START.
3. Host: Create Auction, Restore ON, pick the template, search and choose the registered user for each team (e.g. Ritzz FC to Debadrit Nag), create, then share the room code.
4. Managers join signed in with their own account. Bound users are placed in their team and may type a new name; unbound teams are picked manually. Host starts once every team shows a manager. No retention step appears.

## Reviewer follow-ups (non-blocking, no change made)
- Host must bind users before sharing the code (documented above).
- GET /api/restore/users is open to any authenticated user (rate limited, min 3 chars, max 10 hits). Restricting it to hosts would change behavior, so it was left as is.
- PostgresProfileDirectory is only tested with the memory implementation; it assumes profiles columns username, display_name, default_team_name.
