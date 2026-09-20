# Integration Report — Realtime Football Auction

Frontend (Next.js 16) ↔ Backend (Fastify + WebSocket)

---

## Files Created

| File | Purpose |
|---|---|
| `src/lib/supabase/client.ts` | Browser Supabase client singleton |
| `src/lib/supabase/server.ts` | Server-side Supabase client (RSC / Route Handlers) |
| `src/lib/adapters.ts` | Translates Fastify wire format → frontend domain types |
| `src/lib/money.ts` | Shared money helpers (unitsToCr, crToUnits, formatCr, validateCustomBid) |
| `src/proxy.ts` | Next.js 16 route protection (replaces deprecated `middleware.ts`) |

## Files Modified

| File | Change |
|---|---|
| `.env.local` | Added Supabase URL/anon key; pointed API_URL to port 3001; set MOCK_DATA=false |
| `.env.example` | Updated with all required variables |
| `src/services/api.ts` | Rewritten: Supabase JWT from auth store, typed ApiError, correct error envelope |
| `src/services/auth.service.ts` | Rewritten: Supabase Auth sign-in/up/session/signOut/updateProfile |
| `src/services/room.service.ts` | Rewritten: aligned with all Fastify /api/rooms/* endpoints |
| `src/services/auction.service.ts` | Rewritten: correct endpoint paths, backend response adapters |
| `src/services/profile.service.ts` | Rewritten: reads Supabase DB (profiles, user_stats, user_achievements, view) |
| `src/services/websocket.service.ts` | Rewritten: correct message shapes, ?token= auth, proper reconnection |
| `src/services/mock/mockWebSocket.ts` | Fixed `amount \| amountCr` union for new ClientCommand type |
| `src/stores/auth.store.ts` | Rewritten: holds accessToken, onAuthStateChange listener |
| `src/stores/room.store.ts` | Rewritten: uses real userId, aligned to new room.service API |
| `src/stores/auction.store.ts` | Rewritten: handles real backend event shapes via adapters.ts |
| `src/types/index.ts` | Added all backend-aligned event types; updated ClientCommand union |
| `src/app/room/[roomCode]/page.tsx` | startAuction via WS; fetchRoom without hardcoded userId |
| `src/app/auction/[roomCode]/page.tsx` | JOIN_ROOM on connect; host from ROOM_STATE; AI poll; results redirect |
| `src/app/join/page.tsx` | Removed second arg from joinRoom call |

---

## REST Endpoints Connected

| Endpoint | Method | Used By | Purpose |
|---|---|---|---|
| `/api/health` | GET | — | Health check |
| `/api/rooms` | POST | `room.service.createRoom()` | Create auction room |
| `/api/rooms/:code` | GET | `room.service.getRoomPreview()` | Public room preview (join page) |
| `/api/rooms/:code/state` | GET | `room.service.getRoomState()` | Full RoomState (lobby, player pool) |
| `/api/rooms/:code/join` | POST | `room.service.joinRoom()` | Join a room |
| `/api/rooms/:code/leave` | POST | `room.service.leaveRoom()` | Leave lobby |
| `/api/rooms/:code/settings` | PATCH | `room.service.updateSettings()` | Host updates settings |
| `/api/rooms/:code/results` | GET | `auction.service.getResultsAnalytics()` | Results page data |
| `/api/rooms/:code/teams/:teamId` | GET | `auction.service.getTeamSquad()` | Team detail page |
| `/api/rooms/:code/history` | GET | `room.service.getBidHistory()` | Bid log |
| `/api/rooms/:code/recommendation` | GET | `auction.service.getRecommendation()` | AI suggestion panel (polled every 15 s) |

---

## WebSocket Events Connected

### Client → Server (sent by `websocket.service.ts`)

| Backend type | When sent | Payload |
|---|---|---|
| `JOIN_ROOM` | On WS open (after connect) | `{ roomCode }` |
| `REJOIN_ROOM` | On reconnect | `{ roomCode }` |
| `REQUEST_STATE` | On demand | `{ roomCode }` |
| `PLACE_BID` | Bid button click | `{ roomCode, amountCr, playerId?, expectedSequence? }` |
| `START_AUCTION` | Host "Start" button | `{ roomCode, expectedSequence? }` |
| `PAUSE_AUCTION` | Host pause | `{ roomCode, expectedSequence? }` |
| `RESUME_AUCTION` | Host resume | `{ roomCode, expectedSequence? }` |
| `NEXT_PLAYER` | Host skip | `{ roomCode, expectedSequence? }` |
| `MARK_UNSOLD` | Host mark unsold | `{ roomCode, expectedSequence? }` |
| `END_AUCTION` | Host end auction | `{ roomCode, expectedSequence? }` |
| `KICK_MEMBER` | Host kick | `{ roomCode, targetTeamId, expectedSequence? }` |
| `PING` | Every 25 s heartbeat | `{}` |

### Server → Client (handled by `auction.store.handleServerEvent`)

| Backend type | Handled as | Action |
|---|---|---|
| `ROOM_STATE` | Full state reset | Overwrites all auction state via `adaptRoomState()` |
| `AUCTION_STARTED` | Status → LIVE | Triggers navigation to /auction/[roomCode] |
| `AUCTION_PAUSED` | Status → PAUSED | Disables bid controls |
| `AUCTION_RESUMED` | Status → LIVE | Re-enables bid controls, updates endsAt |
| `AUCTION_COMPLETED` | Status → COMPLETED | Redirects to /results/[roomCode] after 2 s |
| `BID_UPDATED` | Fast delta | Updates currentBid, highestBidder, minimumNextBid, endsAt |
| `BID_REJECTED` | Error notice | Shows bidErrorNotice with backend message |
| `PLAYER_STARTED` | New player | Updates activePlayer, resets bid state, clears overlays |
| `PLAYER_SOLD` | Sold overlay | Shows SoldOverlay with winning team and price |
| `PLAYER_UNSOLD` | Unsold overlay | Shows UnsoldOverlay |
| `TIMER_EXTENDED` | Anti-sniping | Updates endsAt, shows AntiSnipingNotice banner |
| `BUDGET_UPDATED` | Team patch | Updates team budgetSpent/budgetRemaining |
| `CONNECTED` | (ignored) | Connection acknowledged |
| `COMMAND_ACK` | (ignored) | Command acknowledged |
| `PONG` | (ignored) | Heartbeat response |
| `ERROR` | (ignored) | Non-bid errors |

---

## Auth Integration

| Flow | Implementation |
|---|---|
| Sign Up | `supabase.auth.signUp()` with `username`/`display_name` in metadata → DB trigger creates `profiles` row |
| Sign In | `supabase.auth.signInWithPassword()` → fetches `profiles` row |
| Session restore | `supabase.auth.getSession()` on app init (`AppShell` calls `initializeAuth()`) |
| Token refresh | `onAuthStateChange` listener updates `accessToken` in `auth.store` automatically |
| WS auth | `?token=<access_token>` appended to WS URL in `websocket.service.ts` |
| REST auth | `Authorization: Bearer <access_token>` injected by `api.ts` at call time |
| Sign Out | `supabase.auth.signOut()` → clears store, WS disconnects on next command |
| Route protection | `src/proxy.ts` (Next.js 16 proxy convention) — redirects unauthenticated users to `/auth/signin` |

---

## Money Model

All money on the wire is **decimal crores** (`amountCr`, `startingBudgetCr`, etc.).

The Fastify backend stores integer half-crore units internally but always converts to Cr before exposing via REST or WebSocket.

The frontend always works in Cr and uses helpers from `src/lib/money.ts`:

```ts
formatCr(22.5)         // "₹22.5 Cr"
getBidIncrement(9.5)   // 0.5  (< ₹10 Cr)
getBidIncrement(15)    // 1    (₹10–₹20 Cr)
getBidIncrement(22)    // 2    (≥ ₹20 Cr)
validateCustomBid(amount, minimum, budget) // string | null
```

---

## Mock Data Removed / Replaced

`NEXT_PUBLIC_USE_MOCK_DATA=false` in `.env.local` — all services route to real backend.

Mock data files (`mockData.ts`, `mockWebSocket.ts`) are retained for local development when `NEXT_PUBLIC_USE_MOCK_DATA=true` but are **not active in production**.

The mock WS fallback that was silently triggered after 2 failed reconnects has been removed — `websocket.service.ts` now fails with `DISCONNECTED` status after 6 attempts instead of falling back to simulated data.

---

## Adapter Layer (`src/lib/adapters.ts`)

Bridges the schema mismatch between backend and frontend:

| Backend field | Frontend field |
|---|---|
| `currentBidCr` | `currentBid` |
| `minimumNextBidCr` | `minimumNextBid` |
| `remainingBudgetCr` | `budgetRemaining` |
| `startingBudgetCr` | `budgetTotal` |
| `spentCr` | `budgetSpent` |
| `position: "FWD"` | `position: "ATT"` |
| `room.auctionName` | `AuctionRoom.name` |
| `host.userId` | `AuctionRoom.hostId` |
| `team.id` (room_members.id) | `teamId` throughout |

---

## Environment Variables

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_SUPABASE_URL=https://dvhzbkehgnkhernboigi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

### Backend (`backend/.env`)

```
PORT=3001
AUTH_MODE=jwt
JWT_SECRET=<Supabase JWT Secret from dashboard>
JWT_ISSUER=https://dvhzbkehgnkhernboigi.supabase.co/auth/v1
JWT_AUDIENCE=authenticated
SUPABASE_URL=https://dvhzbkehgnkhernboigi.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
DATABASE_URL=<postgres connection string>
```

---

## Remaining Steps Before Production

1. **Fill in backend secrets** — `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` in `backend/.env`
2. **Supabase email confirmation** — if enabled, `signUp` throws "Check your email…"; handle this in the SignUpForm
3. **create page** — `CreateRoomPage` still calls `roomService.createRoom(settings)` with the old 1-arg signature. Update to pass `teamName` from a form field: `roomService.createRoom(settings, teamName, teamLogoUrl)`
4. **Backend CORS** — ensure `FRONTEND_ORIGIN=http://localhost:3000` is set in `backend/.env`
5. **Player pool** — backend ships demo players only; for production import real players via the Supabase `football_players` table seed script

---

## Known Backend Contract Notes

- `GET /api/rooms/:code/state` requires valid membership (user must have already joined)
- `POST /api/rooms` rate-limited to 10/min
- `POST /api/rooms/:code/join` rate-limited to 30/min
- WebSocket `PLACE_BID` payload uses `amountCr` (decimal), not `amount` or integer units
- Backend always sends a full `ROOM_STATE` after every mutation — the store uses this as ground truth
- Sequence numbers on events are room-scoped monotonic integers; stale events (seq ≤ current) are ignored
