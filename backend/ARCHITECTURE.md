# Architecture

## Boundaries

`server.ts` composes environment, authentication, storage and catalog adapters.
`app.ts` registers Fastify, CORS, rate limits, WebSockets and routes.

```text
REST routes / authenticated WebSocket commands
                 |
      RoomService / AuctionEngine
                 |
   RoomManager + per-room SerialQueue
                 |
 clone -> validate -> atomic commit -> runtime replacement
                 |
           events + ROOM_STATE
```

Domain objects contain no SDK calls, network connections or client purse values.
Money is integer half-crore units internally. Public projections use Cr.

Modules separate room membership, state transitions, bidding, budgets, squad invariants, timers, teams, results and recommendations. Queue activation and sale resolution are private engine operations, always inside the same room transaction. WebSocket handlers only authenticate, validate, route and deliver.

## Commit protocol

Every mutation obtains the room lock, reads the latest runtime, clones it, validates the command and changes the draft. A successful mutation increments sequence exactly once, regardless of the number of events emitted. Invariants check active-player uniqueness, ownership, budget ledgers and squad limits.

`RoomRepository.commit(draft, expectedSequence)` must atomically store all critical fields: room, player statuses, accepted bids, team budget/squad, purchases, timer deadlines, pending advance and command receipts. Only after success is runtime replaced and the mutation broadcast.

The memory adapter clones on reads/writes. The file adapter uses a flushed temporary file and atomic rename; the application and adapter each serialize their appropriate operations. It is single-process storage, not a distributed lock or a power-loss guarantee. Orphan temporary files are ignored on recovery.

If commit throws, RoomManager re-reads storage under the lock. A successful but unacknowledged commit is adopted, and clients receive a reconciliation snapshot. If read-back fails, runtime is invalidated; further commands must reload successfully. No speculative sale is broadcast. Timer resolution retries after one second. A client gets `PERSISTENCE_UNAVAILABLE` and should fetch state and retry with the same requestId.

Listeners perform synchronous event delivery after commit. Slow sockets close with 1013 and reconstruct from state after reconnect; events are not a durable replay stream. Even if delivery fails after persistence, authoritative state remains retrievable.

## Repositories and future database connection

`RoomRepository` / `AuctionUnitOfWork` is the write-side transaction contract. `UserRepository`, `TeamRepository`, `PlayerRepository`, `AuctionRepository`, `BidRepository`, `PurchaseRepository` and `AchievementRepository` describe read boundaries. `PlayerRepository` resolves catalogs, selected pools and pots; the engine creates each room's auction pool and persists statuses as part of the aggregate transaction.

A future adapter can map snapshots to normalized tables in one database transaction, check the sequence, enforce unique room codes/purchases and keep read-your-writes semantics. No schema is provided here. Do not use individual repository writes outside the unit of work for a sale.

Horizontal scaling requires shared persistence plus exclusive room ownership or a distributed lock and event routing. Merely adding Redis pub/sub or starting a second process against the file adapter is insufficient. `RoomLock` and repository interfaces can be replaced without changing bid rules.

## Timers and restart

Runtime stores start/end timestamps, not countdown ticks. TimerService schedules the nearest active deadline or pending automatic advance. Callback gets the room lock and checks RUNNING, activation ID and the current deadline. Extensions, pause, replaced players and stale callbacks cannot settle an obsolete auction.

File mode persists snapshots for all rooms. Startup uses `RoomRuntimeHydrator` to validate them and schedules recoverable RUNNING rooms. An overdue player resolves immediately; downtime counts toward a running timer. PAUSED rooms remain paused and preserve remaining duration. Membership survives; socket presence never survives restart. Invalid persisted state fails startup rather than guessing winners.

Memory mode intentionally has no restart recovery. Completed/lobby snapshots are retained. There is no automatic retention cleanup; backups, data-directory access controls and retention are operator responsibilities.

## Security and load boundaries

AuthService verifies tokens before HTTP actions and WebSocket upgrade. The JWT adapter validates signature, issuer, audience, subject and expiry. Static tokens require explicit development mode, prohibited by production configuration. Socket commands derive identity from the connection; no supplied userId/teamId is accepted. KICK_MEMBER uses a targetTeamId only as the host's target, never as actor identity.

Allowed origins are exact. WebSockets require Origin even for non-browser clients. Native browser connections may pass the token in the query, so request logs omit the query and all headers. Reverse proxies must likewise redact WebSocket query tokens. Use HTTPS/WSS publicly.

REST limit: 120 requests/IP/minute, create 10/IP/minute, join 30/IP/minute. WebSockets: 30 commands/user/second across sockets, counting rejected/malformed attempts, plus 32 queued commands/socket. Rejected bids do not cause a separate cooldown; up to the short-window limit, the next valid bid is processed immediately. The boundary permits a burst around the fixed window edge. It is not a distributed limiter. Do not blindly trust forwarded IP headers; configure a trusted proxy before changing Fastify trustProxy.

Messages/bodies are limited to 16 KiB. Outbound backlog above 1 MiB disconnects slow clients. Native ping/pong every 30 seconds detects dead sockets; auth expiry is also checked each command and heartbeat. A disconnect removes presence, never the team. Multiple sockets for the same user are supported.

## Recommendations and results

The deterministic recommendation implementation combines OVR, available stats, target position gaps, comparable remaining-player scarcity and affordable average spend per unfilled slot. The ceiling is capped by server budget and prospective reserve. It is advisory; a warning accompanies unaffordable/overvalued asks. The service never mutates bids.

Results derive from the committed purchase ledger. Longest bidding war ranks sold-player auctions by accepted bid count, with elapsed duration as a tie-breaker (duration includes pauses). Average prices are statistical ratios and may have more than half-crore precision. Ties in other rankings retain room/purchase order.

## Framework references

WebSocket hooks and synchronous listener registration follow the [official Fastify WebSocket documentation](https://github.com/fastify/fastify-websocket). Server options follow the [Fastify server reference](https://fastify.dev/docs/latest/Reference/Server/).
