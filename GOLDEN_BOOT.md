# Fixture goalscorers and Golden Boot

This is an additive application feature using the existing `manager_match_lineups.scorers` JSON records. No schema migration, reseed, tournament recreation, or modification of existing production results is required.

## Using the feature

- **Fixtures → Enter Result / Correct Result:** enter the score, choose scorers and goal counts, and save. A player may score more than once. Each team's assigned total must equal its score; the backend validates ownership at match capture and exact totals.
- **Completed fixture → Add Goalscorers:** the score fields are locked. This updates scorer records only, including for closed seasons and ended Manager Modes. Existing scores, completion timestamps, standings, rewards, squads, budgets and transfer windows are preserved.
- **Standings → Golden Boot:** select a season to see the top-three podium and ranked leaderboard. The default Standings tab remains the existing league table.
- Hosts can open **Manage recorded goals** below Golden Boot to backfill or correct a historical season's fixtures. Fixture history is paginated.

## Compatibility and authoritative records

Existing goalscorer records, including Matchdays 1–4 of an ongoing season, remain the source of truth. Fixture cards read their stored fixture/team scorer captures immediately; Golden Boot aggregates those same records for the selected season. Loading, refreshing, or opening the leaderboard does not insert, recreate, reset, or duplicate scorer records. Fixture, team, player, season and matchday associations remain unchanged. No automatic backfill or reseed runs. Only missing or incomplete scorer data needs manual entry; already recorded goals count immediately. Counts change only through an explicit host correction or result reset.

Old completed matches remain valid with missing or partial scorer records. Their cards show “Goalscorers not recorded”; the leaderboard explains how many results are incomplete and includes only recorded goals. A 0–0 needs no scorer entries.

The public result-save API requires scorer data on new requests. The internal legacy score-only service path remains available for older persisted-data workflows; loading existing results never validates them as new submissions. Once a scorer set is submitted, exact totals are required. Correcting a result and replacing its scorer set happen in the existing tournament transaction. Repeated player selections are consolidated into a count; edits replace counts rather than incrementing a season total.

Saved immutable lineup eligibility takes precedence. If a historical match has no capture, the backend reconstructs eligible ownership from the transfer ledger at its original completion time. It creates no fictional starting XI. Missing or insufficient historical ownership evidence can prevent selecting a player; it never invalidates the existing result.

Matches played count only saved starting-XI appearances in completed matches. Goals per match is zero when no appearances are known. Rankings use goals descending, goals per match descending, appearances ascending and player name ascending; equal sporting statistics share rank. Goals preserve the scoring team from the fixture even after a transfer. Current-team identity is displayed for active seasons, while completed seasons retain scoring-team context.

Unrevealed Hero identities remain masked for unauthorized viewers. Player portraits use the existing shared resolver and fallback.

## API and realtime

Authenticated endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/manager-mode/:id/seasons/:seasonId/stats/golden-boot` | Backend ranking, recorded appearances and missing-data counts |
| `GET /api/manager-mode/:id/fixtures/:fixtureId/scorers` | Host-only eligible player IDs for the editor |
| `GET /api/manager-mode/:id/seasons/:seasonId/fixtures?offset=0` | Historical fixtures and their saved scorer/lineup records, 50 per page |
| `POST /api/manager-mode/:id/actions` | Existing result save or scorer-only update |

Scorer-only action (inside the standard request-ID envelope):

```json
{
  "type": "UPDATE_FIXTURE_SCORERS",
  "fixtureId": "<fixture-id>",
  "expectedHomeScore": 2,
  "expectedAwayScore": 0,
  "scorers": {
    "<home-team-id>": [{ "playerId": "<player-id>", "goals": 2 }],
    "<away-team-id>": []
  }
}
```

The expected scores prevent backfilling against a result changed by another request. The existing tournament row lock, command receipts and atomic persistence apply. Errors include `HOST_ONLY`, `FIXTURE_NOT_COMPLETED`, `STALE_FIXTURE_SCORE`, `INVALID_SCORER`, `SCORER_COUNT_MISMATCH` and `SCORERS_REQUIRED`.

Committed changes emit `FIXTURE_SCORERS_UPDATED` and `PLAYER_STATS_UPDATED`; result changes also emit `FIXTURE_RESULT_UPDATED` and `STANDINGS_UPDATED`. The existing authoritative snapshot/patch updates cards and squad stats. Golden Boot refetches only for relevant stats events, season changes and reconnection, with cancellation and debounce.

## Verification

```sh
# backend/
node node_modules/vitest/vitest.mjs run tests/golden-boot.test.ts tests/squad.test.ts tests/manager-mode.test.ts
node --env-file=.env --import tsx scripts/test-manager-postgres.ts --write-fixtures --goals-only

# frontend/
node tests/golden-boot-ui.mjs
```

The Postgres test creates isolated test records and removes them afterward. It does not reset or backfill a real tournament. Deploy the frontend and backend together; no new environment variables are needed.
