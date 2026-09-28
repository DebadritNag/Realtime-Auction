# Manager Mode realtime recovery

## Root cause and fixes

The browser event allowlist omitted `SECRET_PLAYER_CLAIMED`, `SECRET_PLAYER_POOL_UPDATED`, `SECRET_PLAYER_REVEALED`, `SQUAD_UPDATED`, `FIXTURE_FORMAT_UPDATED` and `FIXTURES_GENERATED`. These valid events caused the “Unable to read server state” message for every recipient. The same catch block also incorrectly treated exceptions in subscribers as invalid JSON.

The protocol now accepts those signals, ignores well-formed future informational events during rolling deployments, validates patch versions, and isolates subscriber exceptions. Malformed data triggers automatic recovery rather than a manual reconnect instruction.

The Manager Mode store uses a debounced, single-flight REST resync with a 20-second deadline and three bounded attempts. It ignores stale replies, requires recovery to reach the detected sequence, cancels work on navigation, and presents SYNCED / RESYNCING / OFFLINE / ERROR with manual Retry after exhausted attempts. Patches use `baseSequence`, so coalesced sequence jumps are valid when their base matches the client.

## Performance

- Concurrent reads of the same tournament share one repeatable-read transaction; each caller receives a detached aggregate, with recipient-specific filtering applied afterward. No cross-user response cache is used.
- Eight core collections are fetched in one SQL round trip. Existing transaction locks and persistence boundaries are retained.
- Player hydration uses maps for original records and latest transactions instead of scanning history per player.
- Broadcasts coalesce within 25 ms. Each manager receives a private projection and field-level patch; previous field signatures are reused. Unchanged player lists retain client references.
- Network snapshots omit historical fixture arrays and historical match lineups, transfer-window budget snapshots, and auction-import ledger rows. They include season fixture counts, current fixtures/scorers, the latest 50 transfers and notifications, and existing history cursors. Historical fixtures are available through authenticated `GET /api/manager-mode/:id/seasons/:seasonId/fixtures?offset=0` (50 per page). Existing history and PDF endpoints retain full persistent records.
- Private negotiation conversations remain recipient-filtered. Groq still executes after the deterministic transaction releases its lock.
- The existing shared pool remains capped at five connections. Existing 30-second ping/pong, 1 MiB outbound backpressure limit, and reconnect backoff with jitter remain enabled.

## Safe diagnostics

Info logs record `manager_state_db`, `manager_state_fetch`, `manager_action_timing`, `manager_broadcast`, and `realtime_health`. Debug logs record `manager_payload` with bytes, serialization time, connection/user/tournament IDs and sequences. Health logs include active sockets, RSS, mean and p99 event-loop delay. Repository logs include active shared reads, read waiters, and the configured pool maximum; these are application metrics, not invented driver pool statistics.

Run read-only database and payload diagnostics from `backend/`:

```sh
node --env-file=.env --import tsx scripts/diagnose-manager-realtime.ts
```

This reports aggregate sizes/timings, indexes and sampled query plans without printing player rows, conversations, keys, tokens or database URLs. Initial checks found existing indexes on the sampled tournament queries and sub-millisecond execution there, so no speculative index migration was added. Network/database round trips remain deployment-dependent. Render CPU and process metrics must be assessed after deployment using these logs; local results do not establish production capacity.

## Verification and deployment

```sh
# backend/
node node_modules/vitest/vitest.mjs run tests/realtime-protocol.test.ts tests/manager-mode.test.ts tests/secret-heroes.test.ts tests/fixture-format.test.ts tests/negotiation.test.ts tests/host-reports.test.ts

# frontend/
node tests/manager-realtime.mjs
node tests/websocket-protocol.mjs
```

Deploy both frontend and backend. No database migration or new secret is required. Set `LOG_LEVEL=debug` temporarily when detailed payload measurements are needed, then restore the normal log level.
