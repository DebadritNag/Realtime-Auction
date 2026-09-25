# Manager Mode

Manager Mode snapshots a completed auction into an independent, durable tournament. FC24 matches are played externally; the host records results. Fastify owns validation, transactions and realtime delivery. Supabase provides Auth and PostgreSQL; Supabase Realtime is not used.

## Persistence

Production requires `DATABASE_URL`. `PostgresManagerTournamentRepository` reads and writes Kiro's normalized Manager Mode tables. There is no `manager_tournaments.state` dependency and no production fallback to memory. Memory remains available for isolated development/tests.

Creation locks the completed source auction and creates teams, memberships, invitations, players, auction-import ledger entries, external-import batch/row audits, notifications and immutable snapshot metadata in one transaction. The unique source auction constraint makes repeated creation safe. External player IDs are compared with both canonical UUIDs and original catalog IDs. Invalid CSV rows must be corrected before creation; duplicate rows are skipped and audited. Stats must be integers from 0 to 99.

For auctions still stored by the existing file runtime, a completed-only archive writes their historical snapshot into the existing auction tables before Manager Mode creation. This does not change live auction behavior or original budgets. Source users must exist in Supabase Auth/profiles.

Each mutation locks its tournament row, reloads normalized state, validates the authenticated manager, applies the change and commits atomically. Score changes use `save_fixture_result`; accepted swaps use `accept_manager_trade`; free-agent signing uses `change_player_ownership` inside the same transaction as the budget debit, session updates and notifications. No irreversible result is broadcast before commit. Direct browser execution of these RPCs must remain revoked.

Immutable creation metadata and command receipts/sequences live in `manager_tournament_events.metadata`; mutable players, teams, fixtures, trades and negotiations live in normalized tables. Full state reads use repeatable-read transactions. Scores, squads, budget, history and conversations survive a fresh backend connection/restart. Legacy tournaments without the required creation snapshot return `MANAGER_SNAPSHOT_MISSING`; they need an explicit verified backfill rather than guessed original budgets.

## Interface

- `/manager-mode`: invitations and tournaments.
- `/manager-mode/create/[auctionId]`: completed auction setup and external CSV preview.
- `/manager-mode/[id]`: dashboard, squad, fixtures, standings, teams, notifications and host controls.
- `/manager-mode/[id]/transfers`: overview and host transfer rules.
- Transfer child routes: `free-agents`, `free-agents/[playerId]`, `trades`, `buyout`, `offers`, `history`.

New teams receive the configured base transfer budget (default 200 half-crore units / ₹100 Cr) plus their unused auction purse by default. Set `addUnusedAuctionPurse: false` for equal base-only budgets, or set `startingBudgetUnits: 0` for remainder-only budgets. Fastify calculates actual spending from the purchase ledger. Existing tournaments are not retroactively credited. Host joins automatically; other managers accept their own invitations. Single/double round robin and odd-team byes are supported. Standings derive from recorded completed fixtures: 3/1/0 points, goal difference, goals scored, then stable team ID.

See [MANAGER_SEASONS.md](MANAGER_SEASONS.md) for multi-season lifecycle, player sales, buyouts, rewards, migrations and verification.

## REST and realtime

All endpoints require the existing Supabase bearer token. Fastify derives identity; clients cannot select an acting manager/team.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/manager-mode` | Current user's tournaments |
| GET | `/api/manager-mode/from-auction/:id` | Setup snapshot |
| POST | `/api/manager-mode/from-auction/:id/preview` | `{csv}` validation report |
| POST | `/api/manager-mode/from-auction/:id` | Create using validated setup settings |
| GET | `/api/manager-mode/:id` | Personalized full state |
| POST | `/api/manager-mode/:id/join` | `{requestId}` accept own invitation |
| POST | `/api/manager-mode/:id/actions` | `{requestId, action}` validated mutation |

Use the existing authenticated WebSocket and `SUBSCRIBE_MANAGER_MODE` with `{tournamentId}`. Reconnection requests a fresh `MANAGER_MODE_STATE`. Snapshots contain only the caller's negotiation conversations; hidden profiles never leave Fastify. The store accepts equal/newer sequences and ignores older state. Request IDs persist across restarts and reject reuse for another action.

See [TRANSFER_NEGOTIATION.md](TRANSFER_NEGOTIATION.md) for actions, rules, privacy, dialogue configuration and events.

## Verification and deployment

Backend typecheck/build and targeted tests: run the scripts in `backend/package.json`. The browser harness is `node frontend/tests/manager-mode-ui.mjs`. The guarded real-Postgres test is:

```powershell
node --env-file=backend/.env --import ./backend/node_modules/tsx/dist/loader.mjs backend/scripts/test-manager-postgres.ts --write-fixtures
```

It creates isolated test users/auction/tournament records, verifies eight managers, 192 owned + 70 free players, 28 fixtures, score correction, swaps, concurrent signings, recovery and permissions, then deletes only its fixtures. `--imports-only` runs the smaller snapshot/import audit check. Never use arbitrary production IDs in test cleanup.

Apply the new negotiation migration after Kiro's foundation tables/RPCs exist. The configured project has migration `20260924114651` applied and recorded. For another database use the Supabase migration workflow; `backend/scripts/apply-negotiation-schema.mjs` is an explicitly invoked helper for this migration only (`SUPABASE_CLI` can override the executable path).

Render needs the matching production `DATABASE_URL`, existing Supabase auth configuration and frontend origin. Redeploy backend and Vercel frontend together. No additional public frontend secret is required. Optional dialogue credentials are backend-only. This implementation has been tested locally and against the configured database; a production Render restart has not been performed.

The existing auction file runtime still needs durable storage for active auctions. Manager Mode's Postgres persistence does not change that separate limitation. Realtime delivery currently assumes one Fastify instance; multiple instances need a shared event transport to deliver updates across processes. Database writes remain serialized by PostgreSQL locks.
