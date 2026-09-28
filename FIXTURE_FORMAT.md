# Manager Mode fixture formats

The selected `format` is stored as `manager_tournaments.fixture_format`. A new tournament creates its schedule immediately; invitations still have to be accepted before the host starts the tournament. Starting preserves those fixture IDs.

| Teams | Format | Matchdays | Matches |
| --- | --- | --- | --- |
| 8 | Single round robin | 7 | 28 |
| 8 | Double round robin | 14 | 56 |

For an odd number of teams, each leg has N matchdays with one bye per team. The second leg reverses every home/away pairing.

## Repair an existing tournament

Open **Manager Mode → Host Control → Fixture Format → Double**. Review the counts and confirm **Upgrade to Double**. A tournament already labelled Double with missing fixtures shows **Repair Double Schedule**.

The authenticated host sends `POST /api/manager-mode/:id/actions`:

```json
{
  "requestId": "<uuid>",
  "action": {
    "type": "UPDATE_FIXTURE_FORMAT",
    "format": "DOUBLE_ROUND_ROBIN"
  }
}
```

The tournament and current season must be active. Within the existing Postgres tournament transaction/row lock, the backend validates a complete first leg, rejects duplicate or malformed pairings, appends only missing reverse games, and persists the selected format. The tournament lock serializes concurrent season changes and fixture upgrades.

Existing IDs, matchdays, scores, scorer/appearance records, standings, squads, budgets, offers, history and transfer-window state remain intact. Partial valid second legs can be completed. Repeated requests and selecting Double again do not append duplicates. No schema migration or new environment variable is required.

`MANAGER_MODE_UPDATED` delivers the authoritative snapshot/patch through the existing WebSocket subscription. `FIXTURE_FORMAT_UPDATED` and `FIXTURES_GENERATED` follow the committed update.

## Downgrade safety

Existing reverse fixtures are never deleted by this action. A completed second-leg fixture returns `SECOND_LEG_PLAYED`; an unplayed second leg returns `FIXTURE_DOWNGRADE_BLOCKED`. A Double label on a single-only schedule can be corrected to Single. Historical or completed seasons cannot be changed.

## Verification

```sh
# backend/
node node_modules/vitest/vitest.mjs run tests/fixture-format.test.ts tests/manager-mode.test.ts tests/manager-setup.test.ts

# frontend/
node tests/fixture-format-ui.mjs

# backend/ — configured database; creates and cleans isolated test records
node --env-file=.env --import tsx scripts/test-manager-postgres.ts --write-fixtures --fixtures-only
```

The current source already supported double generation and passed the selected format from the setup form. The repair addresses persisted format updates and existing incomplete schedules; it does not assume that regenerating every fixture is safe.
