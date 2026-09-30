# Manager Mode Cups and Trophy Gallery

This extends existing Manager Mode. Cups default to **off per season**. No existing season, league result, goalscorer, lineup, transfer, balance or trophy is reset or reseeded.

## Host flow

1. Activate Manager Mode, then open **Host Control → Cup competition**.
2. Enable the Cup, choose its name and settings, and save. This is safe during an ongoing league.
3. Complete every league fixture. The existing league closure, League Shield and bonus process runs unchanged. The Cup then uses that season's frozen final standings to qualify and draw teams.
4. Enter results and exact goalscorer totals in **Cup → Fixtures**. Resolve tied knockout aggregates in **Cup → Knockouts** by recording the actual penalty winner.
5. Finish the final and optional third-place match before starting a new season. New seasons default to Cup off; earlier Cup history and trophies remain.

### Supported formats and rules

- Two groups; an even number of qualifiers from 4 through 32, no more than the tournament's team count.
- Optional no-group format: exactly four qualifiers, seeded 1 v 4 and 2 v 3 in the semi-finals.
- Pots are consecutive pairs of final league positions. One team from each pair goes into each group using server-side `crypto.randomInt`. A six-team Cup has two groups of three.
- One or two group meetings per opponent. Group tables award 3/1/0 points; ties use goal difference, goals scored, then stable team ID (the existing standings rule).
- Top two per group advance: A1 v B2 and B1 v A2.
- Semi-finals and finals support one or two legs; two-leg ties reverse venues. No away-goals rule. Penalties are permitted only after every leg is complete and the aggregate is tied; shootout goals do not enter match scores or scorer totals.
- Optional single-match third-place playoff between semi-final losers.
- Settings, pots and qualification become immutable when drawn. Results can be corrected before their group advances or their knockout tie is resolved. Advanced results cannot be changed into a contradictory bracket.
- A season ended early cannot qualify a Cup. Disable an undrawn Cup or complete its league first. An enabled Cup must finish before the next season or ending Manager Mode.

## Persistence and compatibility

Migration: `supabase/migrations/20260930090313_manager_cups_trophies.sql`.

Two additive tables hold season-scoped Cup aggregates and distinct trophy records. The Cup JSON aggregate contains settings, immutable qualification/draw, fixture IDs, lineup/scorer captures, ties, finishes and lifecycle timestamps. It is intentionally separate from `manager_fixtures` and `manager_match_lineups`: Cup results cannot contaminate league standings or Golden Boot. Result validation reuses the existing squad engine against Cup-local captures.

All writes use the existing Postgres tournament-row lock and transaction, including command receipts. Repeating the same request ID has no duplicate side effects. Trophy uniqueness is `(tournament_id, season_id, trophy_type)`. Trophy awards are insert-only; historical League Shields already recorded as season champions are projected into the gallery without rewriting or awarding old seasons again.

Both tables have RLS enabled and no `anon`/`authenticated` grants. Access is through authenticated Fastify endpoints; host permissions are validated server-side. Supabase Realtime is not used. When tables have not yet been installed, existing Manager Mode reads and league actions continue to work; enabling Cups requires the migration.

The schema was applied and registered against the configured database during implementation. For another environment, from `backend/`:

```sh
node --env-file=.env scripts/apply-cup-schema.mjs
node --env-file=.env scripts/apply-cup-schema.mjs --apply
```

The first command inspects schema only. The second adds tables/indexes and registers the migration; it never reseeds tournaments. No new environment variables are needed. Deploy backend and frontend together after schema installation.

## Trophy Gallery and history

**Trophy Gallery → All clubs / My club** shows every team's League Shields, Cups and total trophies. **View club history** shows:

- Season finishes, bonuses and meaningful Cup placements. Runner-up, semi-finalist and third place do not count as trophies.
- Bought, sold/released and traded-out player transaction counts.
- Transfer spending (including original auction purchases), resale/buyout income and net spend, in integer half-crore units.
- Total recorded bonuses, current budget, and league-plus-Cup W/D/L, goals for/against and matches played. Penalty decisions do not change a drawn fixture's W/D/L.

Stats are derived on the backend from the **full** persisted ledger, fixtures and season history, not the truncated realtime history. No assists or simulated results are introduced. Previously recorded league scorers continue to appear and count in Golden Boot unchanged.

## Contracts and realtime

Existing authenticated action endpoint: `POST /api/manager-mode/:id/actions`, with `requestId` and one of:

- `CUP_SETTINGS`: `settings` (`enabled`, `name`, `qualifiedTeams`, `groupStage`, `groupMeetings`, `semiFinalLegs`, `finalLegs`, `thirdPlace`).
- `CUP_SCORE`: `fixtureId`, `homeScore`, `awayScore`, `scorers` keyed by team ID. Exact scorer totals are mandatory.
- `CUP_PENALTIES`: `tieId`, `winnerTeamId` (must belong to that unresolved, tied aggregate).

Read endpoints (membership required):

- `GET /api/manager-mode/:id/cups`: complete Cup history plus backend group standings.
- `GET /api/manager-mode/:id/club-history`: full-ledger club history and trophies.
- Existing host-only `GET /api/manager-mode/:id/fixtures/:fixtureId/scorers` supports Cup eligibility captures too.

Authoritative Manager Mode snapshots/patches include `cupData`. After commit, signal events include `CUP_ENABLED`, `CUP_QUALIFIERS_CONFIRMED`, `CUP_DRAW_COMPLETED`, `CUP_FIXTURE_UPDATED`, `CUP_GROUP_STANDINGS_UPDATED`, `CUP_SEMI_FINAL_READY`, `CUP_FINAL_READY`, `CUP_COMPLETED`, `TROPHY_AWARDED`. `CUP_ENABLED` reports any settings change, including switching off before a draw. Clients reconcile through the existing sequenced snapshot/patch layer; Cup/history views refetch on updated snapshots.

## Verification

```sh
# backend
node node_modules/vitest/vitest.mjs run tests/cups.test.ts tests/golden-boot.test.ts
node --env-file=.env --import tsx scripts/test-manager-postgres.ts --write-fixtures --cups-only
# frontend
node tests/cups-ui.mjs
```

The Postgres scenario creates and removes isolated test records. It tests a full six-team Cup, two-leg semi-finals, penalties, final, third place, request retries and fresh-connection recovery while comparing all league state before/after. Browser tests cover Cup settings, groups, result entry, gallery, club detail and mobile layout. Cup-specific PDFs are deferred; season/competition-scoped fixtures and trophy records are available for a future report adapter.
