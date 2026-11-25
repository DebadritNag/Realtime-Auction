# Restore auction v2: reviewer notes

**Verdict**: APPROVED

Reviewed `a70557e...HEAD` (3 feature commits), no uncommitted source changes (only regenerated test-result PDFs), the FEAT-001..003 evidence and the final report. Test suites were not re-run.

## Against the original request
- New DB players in the restored pool: `Fc26Catalog.refresh()` is called in restore preview/create, the lobby pool route, and `START_AUCTION` for restored rooms (`refresh(0)`). Confirmed in code. Pool is catalog minus owned players.
- Same user keeps the team, rename allowed: reservation stored as `Team.reservedUserId`; join auto-assigns the reserved team and `renameRestoredTeam` only changes `name`/logo (case-insensitive unique, lobby only). Squad, purse and purchases are untouched. Confirmed. `originalName` stays in `restore.teams`.
- No retention: `retentionPhase` returns OFF for restored rooms, `requireEnabledLobby` and `resetRetentions` reject, state reports `enabled:false`, frontend skips UI and redirect. Confirmed.
- START still blocked while any team is unclaimed (`RESTORE_TEAMS_UNCLAIMED`), so "start after all teams joined" holds.

## Design note
No stored link between a snapshot team and a user exists, so the host binds a registered user to each team before sharing the code. This is a deliberate, well-argued deviation (using `default_team_name` would be spoofable). It means "Debadrit Nag owns Ritzz FC" works only if the host sets it. Accepted.

## Findings (all non-blocking)
- likely: Host must bind before sharing the code; an unbound team can be taken by any joiner. Consider a lobby hint when unbound unclaimed teams exist.
- confirmed: `GET /api/restore/users` is open to any authenticated user (rate limited, min 3 chars, 10 hits) and exposes usernames/display names. Consider restricting to hosts.
- possible: `PostgresProfileDirectory` is untested against a real `profiles` table; assumes columns `username`, `display_name`, `default_team_name`.
- confirmed: Join route now sends any body lacking `teamName` through `restoredJoinSchema`; non-restored rooms still return 400 `VALIDATION_ERROR` from the service, so behavior is preserved.
- Unrelated modified PDFs under `backend/test-results` should not be committed with this work.
