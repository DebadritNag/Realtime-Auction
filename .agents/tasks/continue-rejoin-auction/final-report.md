# Final report: Continue Existing Auction (Part 7) + Automatic Reconnect/Rejoin (Part 8)

## Design decisions
- **Status mapping** (server-derived in `room-summary.ts`): CLOSED -> CANCELLED and COMPLETED -> COMPLETED (never listed as ongoing); PAUSED -> PAUSED; STARTING/RUNNING -> LIVE_AUCTION; LOBBY with retention TEAM_SELECTING/ALL_TEAMS_COMPLETED -> RETENTION_IN_PROGRESS; LOBBY startable (retention OFF/FINALIZED, enough teams) -> READY_TO_START; too few teams -> NOT_STARTED (1 team) or WAITING_FOR_TEAMS; enough teams with retention not begun -> NOT_STARTED. The summary carries a server-chosen `resumePath`.
- **Timer across restart**: the wall-clock `endsAt` is authoritative and keeps running while the server is down. On boot `recover()` + `timers.schedule` resolve an overdue lot exactly once (activationId guard). PAUSED rooms keep `remainingTimeMs`, are never scheduled, and resume sets `endsAt = now + remainingTimeMs`. No grace period or implicit pause.
- **Duplicate connections**: a user may hold several sockets, all receive events, presence counts the user once, commands are idempotent via `requestId`. Cap of 8 per user; the oldest is closed with 4003 (Superseded); the client treats 4003 as terminal and shows "Reconnect to Auction".
- **WS auth**: browser sends `Sec-WebSocket-Protocol: auction.v1, bearer.<jwt>`; server selects only `auction.v1`. The `?token=` query remains accepted (deprecated). Logs do not contain the token.
- Team identity is always derived from `request.auth.userId`; rejoin is read-only and never accepts a team id/name. No host transfer or auto-pause on host disconnect.

## Changed files (commits 62ed912, a425fe4, 4c6d506, fe18650)
Backend: `domain/types.ts`, `modules/rooms/{room-state,room-summary,room.manager,room.routes}.ts`, `realtime/{hub,presence}.ts`, `repositories/{file,interfaces,memory,postgres-live,postgres}.ts`, `app.ts`, `server.ts`, `WEBSOCKET_PROTOCOL.md`, tests `continue-rejoin`, `presence-reconnect`, `restart-recovery`, `helpers-pg-double`.
Frontend: `types/backend.ts`, `services/{room,websocket}.service.ts`, `stores/{auction,connection}.store.ts`, `components/auction/{ActivityFeed,AuctionHeader,AuctionHistoryModal,ConnectionStatus,HostAuctionControls,HostConnectionPanel}.tsx`, `components/home/{OngoingAuctionCard,OngoingAuctionsSection,RejoinAuctionCard}.tsx`, `lib/relativeTime.ts`, `app/{home,auction/[roomCode],room/[roomCode]}/page.tsx`, tests `ongoing-auctions-ui`, `connection-ui`, `reconnect-protocol`, `websocket-protocol`, `auction-redesign-ui`.
Migration: `supabase/migrations/20261004090000_live_room_presence.sql`.

## Migration and apply steps
Additive and idempotent (creates `public.live_room_presence`, RLS on, service_role only). The server works without it (in-memory presence fallback, one warning). Not applied. To apply: Supabase power `apply_migration`, project `dvhzbkehgnkhernboigi`, name `live_room_presence`, query = the file contents.

## API / WS changes
REST new: `GET /api/me/rooms`, `GET /api/rooms/:code/summary`, `POST /api/rooms/:code/rejoin` (403 NOT_ROOM_MEMBER, 404, 409 ROOM_CLOSED, COMPLETED -> canContinue=false, /results). `ROOM_STATE`/`GET state` gain `activity`, `recentBids`, `lastActivityAt`, `ongoingStatus`, `resumePath`, host-only `teamPresence`. WS: subprotocol auth, `PRESENCE_UPDATED` host variant, close codes 4001/4003, `ERROR` reason `UNAUTHENTICATED` before auth close.

## Tests run and results
- Backend `tsc -p tsconfig.build.json --noEmit`: clean.
- Backend `vitest run` (full): all new files (continue-rejoin, restart-recovery, presence-reconnect, realtime-protocol, live-room-repository, recovery-auth-timers) pass. Failures are the 6 known skip-vote baseline failures (5 in skip-vote.test.ts, 1 in integration.test.ts skip-vote case) plus load-only timeouts in cups/seasons/manager-mode/host-reports files on the full parallel run (the set varies between runs).
- Frontend `npm run typecheck`: pass. `npx next build`: pass.
- Frontend node tests passing: ongoing-auctions-ui, connection-ui, reconnect-protocol, websocket-protocol, auction-redesign-ui, skip-vote-ui, retained-panel-ui, recall-ui.
- Frontend failing, in files and components not touched since 1db9e87 (pre-existing): retention-ui and retention-overlay-ui (expect player name "Kylian Mbappe Full", app shows "Kylian Mbappe"), overview-ui (esbuild cannot resolve "react" from the link shim), auction-ui (imports backend TS under node strip-only mode).
- UTF-8 scan of all 43 files changed since 1db9e87: all valid.

## Residual risks
- A long server outage can resolve an overdue lot while nobody can bid (by design; no implicit pause).
- Presence `lastSeenAt` persistence is best-effort until the migration is applied.
- Deprecated query-token auth still works for non-browser clients.
- The four pre-existing frontend test failures above are unrelated and were not fixed.
