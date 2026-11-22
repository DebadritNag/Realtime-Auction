# Review: Continue / Rejoin auction (diff since 1db9e87)

**Verdict**: APPROVED

Status, resume path, counts and the completed/cancelled exclusion are computed on the server (`room-summary.ts`) and the frontend only renders them. I did not re-run the suites. I relied on the evidence in the commit messages and final-report.md: backend tsc clean, new test files (continue-rejoin, restart-recovery, presence-reconnect) passing, and frontend typecheck, next build and the new node tests passing. The only failures recorded are the six skip-vote baseline failures, load-only timeouts, and four frontend tests in files untouched since 1db9e87.

## Rule check
- Team identity: `/api/me/rooms`, `/summary` and `/rejoin` use only `request.auth.userId`. `/rejoin` rejects any body and returns 403 NOT_ROOM_MEMBER, so it never creates a team (confirmed in room.routes.ts).
- Tokens: the browser sends `auction.v1, bearer.<jwt>` in the subprotocol and the server echoes only `auction.v1`. The Fastify request serializer logs the URL without the query string and no headers. The `?token=` query is still accepted for non-browser clients (likely acceptable, recorded as a residual risk).
- Host-only: presence `lastSeenAt` and `teamPresence` go only to the host. End Auction keeps its ConfirmDialog.
- Completed/cancelled: filtered in the repository and again in the route. `canContinue` is false for both, and `/rejoin` returns 409 for CLOSED.
- No placeholder buttons or fake data: the card renders only server fields, and the "-" fallback appears only when the player pool is unknown.
- No localStorage: none found in the changed home, connection or websocket files.
- No duplicates: rejoin is read-only. A socket joining a room that it already joined is not re-added or re-counted. Commands stay idempotent through `requestId`, and the cap is 8 sockets per user.
- Timer: `endsAt` is persisted and authoritative, PAUSED rooms keep `remainingTimeMs`, and nothing restarts on open (per final-report design decisions and the restart-recovery tests).

## Non-blocking notes
- The migration `live_room_presence` is written but not applied. The server falls back to in-memory presence, so this is a deploy step and not a code defect.
- The 4001 close handler retries after fetching a token, which relies on the token refresh in `authService` (possible, not verified).
