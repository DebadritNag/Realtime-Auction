# Multiplayer Football Auction Backend

Standalone Node.js 22+ / TypeScript / Fastify backend. The sibling frontend is not modified. Fastify owns bids, timers, budgets, ownership and host permissions. No database schema or Supabase Realtime is used.

## Run locally

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

API: `http://localhost:3001`. WebSocket: `ws://localhost:3001/ws?token=local-host-token`.
The example environment deliberately enables a development-only token allowlist and an 80-player **fictional demo catalog**. Change these for real use. The default server configuration without an environment file requires JWT configuration.

If this computer's `npm` launcher reports a missing `npm-cli.js`, use the installed CLI directly:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
node node_modules/tsx/dist/cli.mjs watch --env-file-if-exists=.env src/server.ts
```

The server defaults to durable local room files in `backend/data`. Use one server process and one writer per data directory. Production requires a real catalog and JWT authentication.

## Check and build

```sh
npm run typecheck
npm test
npm run build
npm start
```

Tests cover money tiers, budgets/reserves, concurrency, timer expiry, anti-sniping, pause/resume, sales/unsold/recall, host permissions, idempotency, persistence failures, recovery, JWT validation, and a five-participant REST + WebSocket auction.

## Frontend integration

1. Authenticate elsewhere and send its access token as `Authorization: Bearer <token>` for REST. Configure the matching JWT issuer/audience and key on this server.
2. Host calls `POST /api/rooms` with `{auctionName, teamName, settings?}`. Creation also creates the host's team; team capacity includes the host.
3. Other users call `POST /api/rooms/:code/join` with `{teamName, teamLogoUrl?}`.
4. Open a native WebSocket, send `JOIN_ROOM`, and retain the returned `ROOM_STATE`.
5. Host sends `START_AUCTION`. Clients bid with `PLACE_BID`. Reconnect with a fresh token and `REJOIN_ROOM`.
6. At the end of a round, the host sends `START_RECALL` or `END_AUCTION`. Results remain accessible by REST.

Example create body:

```json
{
  "auctionName": "Friday Football Auction",
  "teamName": "City FC",
  "settings": {
    "numberOfTeams": 4,
    "startingBudgetCr": 100,
    "minSquadSize": 11,
    "maxSquadSize": 18
  }
}
```

All REST endpoints except health require authentication. Codes are six uppercase characters excluding I/O/0/1.

| Method | Path | Access / return |
| --- | --- | --- |
| GET | /api/health | Public process liveness and server time |
| POST | /api/rooms | Create room and host team; 201 |
| GET | /api/rooms/:code | Authenticated lobby preview |
| PATCH | /api/rooms/:code/settings | Host, lobby only; settings patch directly in body |
| POST | /api/rooms/:code/join | Create membership; idempotent for identical team details |
| POST | /api/rooms/:code/leave | Non-host, lobby only; 204 |
| GET | /api/rooms/:code/state | Member; authoritative personalized snapshot |
| GET | /api/rooms/:code/results | Member; provisional until completed |
| GET | /api/rooms/:code/teams/:teamId | Member; squad and budget |
| GET | /api/rooms/:code/history?offset=0&limit=50 | Member; paginated accepted bids, limit <= 200 |
| GET | /api/rooms/:code/recommendation | Member; advisory valuation for current player |

Errors: `{error:{code,message,...details},requestId}`. Unknown fields in bodies/commands are rejected.
Live host actions are WebSocket commands, not separate REST endpoints.

## Swap adapters

`buildApp({authService, repository, playerRepository, recommendationService})` is the composition boundary.
Implement `RoomRepository` as an atomic, version-checked unit of work for a future PostgreSQL adapter. Do not implement sale persistence as several independent writes. Read projections for users, teams, auctions, bids, purchases and achievements have interfaces in `src/repositories/interfaces.ts`.

See [architecture](ARCHITECTURE.md), [WebSocket protocol](WEBSOCKET_PROTOCOL.md), [auction rules](AUCTION_RULES.md), and [environment configuration](ENVIRONMENT.md).

## Deliberate V1 limits

- One process owns all rooms. Memory mode loses rooms on restart; file mode recovers live state and settles overdue players after startup.
- File commits rewrite one room snapshot including its history. This is suitable for small deployments; use a transactional database and room ownership before scaling.
- No automatic host transfer. Running auctions continue on host disconnect. Between rounds a returning host decides recall/end.
- Maximum squad size and prospective minimum-squad reserve are enforced; filling a minimum squad is not guaranteed when the pool is exhausted or the host ends early. Results expose `minimumSquadMet`.
- No payment processing, identity signup, LLM, automatic bidding, database provisioning, or frontend.
