# Manager Mode seasons, sales and buyouts

Fastify remains authoritative. All money is integer half-crore units: 2 units = ₹1 Cr. The frontend submits intent and renders personalized server snapshots; it never credits rewards or transfers ownership itself.

## Lifecycle

Every tournament has `seasonData.currentSeasonId`, persisted seasons, a reward ledger and season settings. `modeStatus` is ACTIVE or ENDED; the existing tournament status still supports INVITING during setup. Seasons are ACTIVE, COMPLETED or ARCHIVED.

Submitting the final required score automatically freezes the season table, records its champion and credits performance bonuses atomically. Existing tie breakers apply: points, goal difference, goals scored, stable team ID. Each bonus has a unique `(season_id, team_id)` identity; request receipts and the tournament lock also prevent duplicate commands from awarding it twice.

Host actions use the existing authenticated `POST /api/manager-mode/:id/actions` envelope `{requestId, action}`:

| Action | Additional fields | Result |
|---|---|---|
| END_CURRENT_SEASON | `confirmation: "END SEASON"` | Freeze completed results, leave unplayed matches unplayed, award shield and bonuses once |
| START_NEXT_SEASON | None | Require previous season COMPLETED, create new round-robin fixtures and zero season standings |
| END_MANAGER_MODE | `confirmation: "END MANAGER MODE"` | Permanent read-only history; active season is archived without shield or bonuses |
| SEASON_SETTINGS | `resalePercent`, `bonusUnits` | Host settings for future sales/rewards |
| SELL_PLAYER | `playerId`, `ownershipToken`, `expectedSaleUnits` | Release owned player for the current server quote |

Starting a new season keeps current squads, ownership, budgets, transactions, manager identities and team details. It does not rebuild from the original auction snapshot. Fixtures have a `season_id`; pairing uniqueness is scoped to that season. Schedule rotation changes the ordering while preserving round-robin pairings and odd-team byes. Closed seasons cannot be reopened or edited. The old STATUS/ACTIVE action cannot reopen them.

`ROOM_STATE` is not used for this subsystem. `MANAGER_MODE_STATE` contains current-season fixtures/standings, `seasonData`, `seasonFixturesById`, and the caller's `saleQuotes`. The dashboard/teams/host season selector displays historical final tables, fixtures, champions and rewards. Shield totals derive from persisted season champions. Ended Manager Mode disables all mutations except marking notifications read. Host deletion remains a separate, destructive Danger Zone action.

## Money and rewards

New creation accepts `startingBudgetUnits` (base, default 200) and `addUnusedAuctionPurse` (default true). Opening budget is base + auction starting purse − actual purchase ledger spending. Base 0 supports remainder-only. Neither the original auction budgets nor existing Manager Mode budgets are changed.

Default position bonuses in Cr: 30, 24, 20, 16, 12, 10, 8, 6, 4, 2. Positions beyond ten default to zero. Host configuration requires one non-increasing, non-negative integer-unit amount per team. Changes do not rewrite previous awards. Starting a season never re-adds old rewards.

Sell Player is available from the owner's Squad/Teams view during an open transfer window. Default return is 50% of the latest positive acquisition cost, configurable from 40% to 60%, rounded down to integer units and always below its basis. Pure trades and zero-cash acquisitions use the deterministic server market value. The confirmation displays the basis and return. A stale quote or changed ownership is rejected. The transaction credits the club, clears ownership/acquisition cost, records a RELEASE ledger entry and returns the player to the negotiable free-agent pool. Pending offers involving moved players expire. There is no full-price refund or client-selected payout.

## Transfers

The existing Transfers routes provide Overview, Free Agents, Trade Centre, Buyout, Offers and Transfer History. Free agents use the existing deterministic negotiation and explicit Confirm Signing; Groq only supplies dialogue with template fallback. Trade Centre remains a cash-free swap.

Buyout actions:

- `BUYOUT`: `targetPlayerId`, `offerType: CASH | CASH_PLUS_PLAYER`, `cashAmountUnits`, optional `includedPlayerId`.
- `BUYOUT_COUNTER`: `buyoutId` plus revised offer terms. Buyer/seller roles stay fixed; the responding party alternates.
- `BUYOUT_RESPONSE`: `buyoutId`, `response: ACCEPT | REJECT | CANCEL`.

Acceptance verifies ownership, current funds and recipient permissions under the tournament lock, locks the player/team rows, credits the seller, debits the buyer, moves one or two players and persists transfer/cash ledgers in one transaction. There is one cash movement per accepted offer. Pending terms are private to the two clubs; accepted transfers appear in history. Retried commands use existing persisted request IDs.

## Realtime

After commit, Fastify broadcasts personalized MANAGER_MODE_STATE via the existing subscription, plus applicable event notices:

`SEASON_COMPLETED`, `LEAGUE_SHIELD_AWARDED`, `SEASON_BONUSES_AWARDED`, `NEXT_SEASON_STARTED`, `MANAGER_MODE_ENDED`, `MANAGER_PLAYER_SOLD`, `TEAM_BUDGET_UPDATED`.

Manager sales deliberately use MANAGER_PLAYER_SOLD because PLAYER_SOLD already belongs to the auction protocol with a different payload. Buyouts use BUYOUT_CREATED, BUYOUT_COUNTERED, BUYOUT_ACCEPTED, BUYOUT_REJECTED, BUYOUT_UPDATED, PLAYER_TRANSFERRED and TEAM_BUDGET_UPDATED. Event notices carry tournament identity; the personalized snapshot is the authoritative data. Reconnection fetches the complete persisted state. No Supabase Realtime is used.

## Database and deployment

Migrations, applied and recorded against the configured database:

- `20260924133222_manager_buyouts.sql`
- `20260925162642_manager_seasons_sales.sql`
- `20260925164617_manager_fixture_season_pairing.sql`

The season backfill assigns existing fixtures to Season 1 and freezes legacy closed tables. It never credits historical bonuses or adds an old auction remainder. New tables have RLS enabled and no browser-role write access. Existing normalized persistence and RPCs remain in use. Apply these migrations in order for other databases after the existing Manager Mode foundation/negotiation migrations. `backend/scripts/apply-season-schema.mjs` is an explicit helper for the two season migrations.

Redeploy Render backend and Vercel frontend together. No new environment variables are required for seasons or buyouts. Existing Groq configuration stays server-only. Deployment itself was not performed in this task. A shared event transport is still required before running multiple Fastify instances.

## Verification

- 56 targeted Manager Mode, season, buyout, negotiation and Groq tests pass.
- Offline Chrome UI harness covers score editing, transfers, negotiations, buyout input, sale quote confirmation, strong season confirmation and ended read-only controls.
- Real Postgres buyout and season checks passed, including duplicate acceptance/reward protection, atomic release and fresh-connection recovery. All isolated test fixtures were removed. The harness supports `--buyouts-only` and `--seasons-only`; both create isolated fixtures and remove them afterward. Run from backend with `node --env-file=.env --import tsx scripts/test-manager-postgres.ts --write-fixtures --seasons-only`.
- Full backend suite currently has six unrelated auction skip-vote failures: tests exclude host voting while current auction implementation includes it. Auction logic was not changed for this work.
