# Manager Mode Cups and Trophy Gallery

This extends existing Manager Mode. Cups default to **off per season**. No existing season, league result, goalscorer, lineup, transfer, balance or trophy is reset or reseeded.

## Host flow

1. Activate Manager Mode, then open **Host Control → Cup competition**.
2. Enable the Cup, choose its name and settings, and save. This is safe during an ongoing league.
3. Complete every league fixture. The existing league closure, League Shield and bonus process runs unchanged. The Cup then snapshots that season's final standings and becomes **Draw ready**. The host selects **Generate Cup Draw** in Cup or Host Control; the server creates and persists the seeded draw exactly once. Existing saved draws remain unchanged.
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
- `CUP_DRAW`: no extra fields. Host only, current season must be qualified and undrawn. Duplicate request IDs reuse the existing receipt; a new request cannot regenerate an existing draw (`CUP_DRAW_NOT_READY`).
- `CUP_SCORE`: `fixtureId`, `homeScore`, `awayScore`, `scorers` keyed by team ID. Exact scorer totals are mandatory.
- `CUP_PENALTIES`: `tieId`, `winnerTeamId` (must belong to that unresolved, tied aggregate).

Read endpoints (membership required):

- `GET /api/manager-mode/:id/cups`: complete Cup history plus backend group standings.
- `GET /api/manager-mode/:id/club-history`: full-ledger club history and trophies.
- Existing host-only `GET /api/manager-mode/:id/fixtures/:fixtureId/scorers` supports Cup eligibility captures too.

Authoritative Manager Mode snapshots/patches include `cupData`. After commit, signal events include `CUP_SETTINGS_UPDATED`, `CUP_ENABLED`, `CUP_QUALIFIERS_CONFIRMED`, `CUP_DRAW_COMPLETED`, `CUP_FIXTURE_UPDATED`, `CUP_GROUP_STANDINGS_UPDATED`, `CUP_SEMI_FINAL_READY`, `CUP_FINAL_READY`, `CUP_COMPLETED`, `TROPHY_AWARDED`. `CUP_ENABLED` reports any settings change, including switching off before a draw. Clients reconcile through the existing sequenced snapshot/patch layer; Cup/history views refetch on updated snapshots.

## Verification

```sh
# backend
node node_modules/vitest/vitest.mjs run tests/cups.test.ts tests/golden-boot.test.ts
node --env-file=.env --import tsx scripts/test-manager-postgres.ts --write-fixtures --cups-only
# frontend
node tests/cups-ui.mjs
```

The Postgres scenario creates and removes isolated test records. It tests a full six-team Cup, two-leg semi-finals, penalties, final, third place, request retries and fresh-connection recovery while comparing all league state before/after. Browser tests cover Cup settings, groups, result entry, gallery, club detail and mobile layout. Cup-specific PDFs are deferred; season/competition-scoped fixtures and trophy records are available for a future report adapter.


## Interactive trophy showcase

The user-supplied model is served locally at `frontend/public/models/trophies/cup.glb` (about 9 MB, embedded textures). Include this file in the Vercel deployment. No new environment variables or external model/image service is needed.

The Cup hero lazily imports `TrophyViewer` with SSR disabled. React Three Fiber + Drei load the actual GLB, normalize its bounds, light it with local environment panels, and place it on a pedestal. Mouse/touch rotation and zoom are bounded; panning is disabled. DPR is capped at 1.5. Rotation pauses offscreen, in hidden tabs, for reduced-motion users, or via the Pause control. Rendering uses demand frames while rotation is stopped. A model timeout, load error, context loss or unsupported WebGL shows a lightweight fallback while competition controls remain usable.

The gallery grid uses SVG icons, never a canvas per card. Clicking an individual Cup award opens one native modal with the 3D viewer. Closing it unmounts that viewer. My Club shows trophy counts and seasons; Teams exposes the selected club's cabinet, history and full backend statistics.

Cup progression: `NOT_STARTED` (disabled or legacy), `WAITING_FOR_LEAGUE`, qualification snapshot / `DRAW_READY`, `GROUP_STAGE` (if configured), `SEMI_FINAL`, `FINAL`, `COMPLETED`. The contract also accepts `QUALIFIED` as a ready-to-draw state. Settings may change until the draw, at which point qualification and fixtures lock. These statuses live in the existing Cup JSON aggregate: this update requires no new database migration and performs no live-data backfill.

The draw reveal uses authoritative groups with a short CSS entrance. Champion confetti runs once on a newly observed winner, then stops. Both respect reduced motion. Backend progression and trophy ownership never depend on an animation.
