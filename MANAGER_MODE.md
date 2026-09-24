# Manager Mode — implementation and Kiro persistence handoff

Manager Mode snapshots a completed auction into an independent tournament. FC24 matches are played externally; the host records scores here. Fastify remains authoritative. No Supabase schema, migration, RLS policy, database adapter or Supabase Realtime subscription was created by this change.

## What is implemented

- Results page host action; unique tournament per completed auction.
- Setup review, independent team/player/purchase snapshots, equal transfer budgets (default 200 units = ₹100 Cr), external CSV preview and validation.
- Invitations with accept/decline/resend; the authenticated host is automatically joined. Managers cannot choose another team.
- Dashboard, grouped squads with actual football positions, fixtures, standings, team inspection, transfers, notifications and host controls.
- Single or double round robin, odd-team byes, one-time generation after all managers join.
- Host score entry/correction/reset; standings are always derived from completed fixtures (3/1/0 points, then GD, GF, stable team-ID tiebreak).
- Transfer-window controls, read-only free agents, player-for-player offers/counters/accept/reject/cancel, atomic ownership swaps and transfer history. No cash trades, signing, AI negotiation or match simulation.
- Realtime personalized snapshots and invitations through the existing WebSocket singleton; reconnect authenticates and requests fresh state.

## Routes and money

Frontend routes:
- `/manager-mode`: invitations and tournaments.
- `/manager-mode/create/[auctionId]`: completed auction setup.
- `/manager-mode/[tournamentId]`: dashboard.
- Child sections: `/squad`, `/fixtures`, `/standings`, `/transfers`, `/teams`, `/notifications`, `/host`.

All Manager Mode monetary fields use integer half-crore units. `200` means ₹100 Cr. Use the existing frontend `money.ts` helpers. Auction REST endpoints retain their existing Cr contract; the setup preview is an internal-unit snapshot, not an auction DTO.

Protected REST endpoints (Bearer Supabase access token, existing auth middleware):

| Method | Path | Response / input |
|---|---|---|
| GET | `/api/manager-mode` | Current user's tournament summaries/invitations |
| GET | `/api/manager-mode/from-auction/:auctionId` | Host-only setup preview, teams, players, purchases, existingId |
| POST | `/api/manager-mode/from-auction/:auctionId/preview` | `{csv}` → ImportReport |
| POST | `/api/manager-mode/from-auction/:auctionId` | `{name, startingBudgetUnits, format, csv}` → personalized TournamentState |
| GET | `/api/manager-mode/:id` | Personalized TournamentState |
| POST | `/api/manager-mode/:id/actions` | `{requestId: UUID, action}` → personalized TournamentState |

`manager.schemas.ts` is the action validation source of truth. Actions:
- INVITATION `{accept}`
- GENERATE_FIXTURES
- SCORE `{fixtureId, homeScore, awayScore}`; RESET_SCORE `{fixtureId}`
- WINDOW `{open}`
- STATUS `{status: ACTIVE | COMPLETED | ARCHIVED}`
- TRADE `{offeredPlayerId, requestedPlayerId, parentTradeId?}`
- TRADE_RESPONSE `{tradeId, response: ACCEPT | REJECT | CANCEL}`
- READ_NOTIFICATION `{notificationId}`
- ANNOUNCE `{message}`; RESEND_INVITATIONS

Same user + requestId + payload returns current state without replaying the mutation. Reusing that requestId with different content fails. Server derives user identity, memberships, ownership and host status. Closed windows expire pending offers. Acceptance expires other pending offers involving either moved player. Archived tournaments are read-only except notification acknowledgements. Reopening a completed tournament permits result corrections; archive is final.

Errors use the existing `{error:{code,message},requestId}` envelope. Important codes: MANAGER_PERSISTENCE_UNAVAILABLE (503), HOST_ONLY (403), NOT_TOURNAMENT_MEMBER (403), INVITATION_NOT_ACCEPTED, INVITATIONS_PENDING, FIXTURES_EXIST, TRANSFER_WINDOW_CLOSED, INVALID_OWNERSHIP, TRADE_PERMISSION, TRADE_NOT_PENDING, STALE_OWNERSHIP, REQUEST_ID_REUSED, INVALID_IMPORT, VALIDATION_ERROR.

## Realtime contract

Existing `/ws?token=<access token>` and configured frontend Origin validation apply.

Client subscription:
```json
{"type":"SUBSCRIBE_MANAGER_MODE","requestId":"optional-id","payload":{"tournamentId":"id"}}
```
Omit tournamentId for the user's inbox channel. One active app socket is shared across auction/Manager Mode routes. Navigation closes the previous connection; unexpected closure reconnects with capped backoff and re-subscribes.

Server envelopes retain `{type, sequence, serverTime, requestId?, payload}`:
- MANAGER_MODE_STATE: personalized TournamentState, including standings, own notifications, and relevant offers. Monotonic sequence; frontend discards older snapshots.
- MANAGER_MODE_INBOX: user's tournament summaries.
- MANAGER_MODE_CREATED / MANAGER_MODE_UPDATED: `{tournamentId}` invalidation events sent to authenticated tournament members, including connections currently viewing an auction. Subscribed tournament sockets also get a fresh personalized state. Inbox clients refresh their list.

REST actions publish only after repository commit succeeds. State is replaced from the server, never reconstructed from local storage. No match or budget calculations on the frontend are authoritative.

## Kiro: required adapter contract

Implement and inject `ManagerTournamentRepository` from `backend/src/modules/manager-mode/manager.repository.ts` through `buildApp({managerRepository})` in `server.ts`. Do not change domain services or frontend contracts to match physical table names.

Methods:
1. `find(id)`: detached full Tournament or null.
2. `findByAuction(auctionId)`: unique tournament or null.
3. `listForUser(userId)`: all invited/joined/declined tournaments for that user; exclude unrelated users.
4. `createUnique(tournament)`: transactionally enforce unique sourceAuctionId; return `{tournament,created}`. A concurrent creator must receive the already-created aggregate.
5. `mutate(id, callback)`: load/lock the latest aggregate, invoke callback on a detached draft, atomically commit all changed data, return committed aggregate. If callback or persistence fails, commit nothing. Serialize across ALL backend instances (row lock or equivalent transaction/CAS). Never split the two player ownership changes into separate commits.

Persist every field in `manager.types.ts`, including independent `startingSnapshot`, sequence, receipts, teams, players, fixtures, trades, transactions, notifications, audit, window state and source-auction references. The schema is Kiro's responsibility. The immutable starting snapshot and auction purchase prices must survive trades. Unique player IDs are scoped to the tournament; the same footballer may exist in separate tournaments.

Atomic trade acceptance must persist: both player owners/acquisition metadata; accepted offer; conflicting offer expirations; two transfer ledger entries; notifications; audit; command receipt; next sequence. Scores and fixture status must commit together. Standings can be derived on read; do not increment persisted standings on score edits.

Provide `ManagerIdentityRepository.findUsernames(userIds)` via `buildApp({managerIdentities})` to resolve historical managers from the existing profile system. New auction teams also capture the verified auth username. Missing legacy usernames are explicitly unavailable, never fabricated.

The auction lookup currently reads the existing RoomRepository snapshots by auction ID. If Kiro's auction adapter doesn't return completed auctions in `listRecoverable`, replace this lookup with an explicit completed-auction read adapter while preserving the Room snapshot contract.

Ensure authenticated users cannot directly alter team ownership, budgets, fixtures or host permissions through client database access. Database policies and service credentials remain Kiro's work. Notifications and receipts need durable retention suitable for reconnects/retries; any retention policy must preserve idempotency guarantees for its documented retry window.

## Temporary adapter and deployment

`MemoryManagerRepository` is wired only when `NODE_ENV !== production`. It is a real transactional development adapter, not UI mock data. Its tournaments disappear on process restart. `buildApp` without an injected repository, and the production server until Kiro wires the adapter, return an explicit 503 for Manager Mode. Existing auctions remain available.

No new secrets or frontend environment variables. Existing `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, Supabase Auth variables and `FRONTEND_ORIGIN` still apply. Render/Vercel cannot enable durable Manager Mode through an environment toggle alone: Kiro must implement/inject the repository first, then deploy both projects. Do not set production NODE_ENV to development to bypass this boundary.

## External CSV

Maximum 2 MB and 2,000 player rows. Required: player_id (or sofifa_id/ea_id), name (or short_name), overall, position (or player_positions). Require stable IDs; exclude all auction IDs and repeated external IDs. Positions must be actual GK/CB/LB/RB/LWB/RWB/CDM/CM/CAM/LM/RM/LW/RW/ST/CF, not broad categories. Supports secondary_positions, club, nationality/nation, age, six core stats, image_url and rating_tier. Invalid rows block creation; duplicate rows are reported and excluded. Final creation revalidates raw CSV on the server, rather than trusting browser preview objects.

## Verification

- Backend domain/integration suite covers 8 teams × 24 owned players, 20 unsold + 50 external = 70 free agents; 28 fixtures / 7 days / 4 games; odd byes/doubles; 3–1 corrected to 2–2 and reset; invitation/host validation; closed windows; ownership; counters/reject/cancel; concurrent acceptance; retry idempotency; failed-draft rollback; private notifications; authenticated REST/WS and exact reconnect state.
- `node node_modules/vitest/vitest.mjs run` in backend.
- `node frontend/tests/manager-mode-ui.mjs`: offline Chromium component checks for dashboard, score actions, trade payloads, closed-window controls, filters, host restrictions and mobile standings.
- TypeScript checks in both projects; frontend webpack production build.

The browser test uses explicitly scoped fixtures only. Production UI has no fabricated tournament data. Live deployment/database integration is pending Kiro's adapter and is not claimed by these local tests.

## File inventory

Created:
- `backend/src/modules/manager-mode/manager.types.ts`, `manager.schemas.ts`, `manager.repository.ts`, `manager.service.ts`, `manager.routes.ts`, `fixture.service.ts`, `external-import.service.ts`.
- `backend/tests/manager-mode.test.ts`.
- `frontend/src/app/manager-mode/page.tsx`, `create/[auctionId]/page.tsx`, `[tournamentId]/[[...section]]/page.tsx`.
- `frontend/src/components/manager-mode/ManagerSetup.tsx`, `ManagerWorkspace.tsx`.
- `frontend/src/services/manager-mode.service.ts`, `frontend/src/stores/manager-mode.store.ts`, `frontend/src/types/manager-mode.ts`.
- `frontend/tests/manager-mode-ui.mjs`, root `README.md`, `INTEGRATION.md`, and this document.

Modified:
- Backend `app.ts`, `server.ts`, `domain/types.ts`, room manager/routes/service, realtime hub/protocol.
- Frontend results page, AppShell, shared WebSocket service, backend event types.

The frontend Manager Mode DTO file mirrors `backend/src/modules/manager-mode/manager.types.ts`; keep it synchronized when changing the contract. Shared transport uses existing auth/API infrastructure. Concurrent edits under `supabase/` belong to the external persistence work and were not changed by this implementation.

Verification outcome: **77 backend tests passed**, backend/frontend strict TypeScript passed, webpack production build passed, and the standalone Manager Mode Chromium UI checks passed. Browser tests are component-level; live Supabase-backed deployment testing awaits the persistence adapter.
