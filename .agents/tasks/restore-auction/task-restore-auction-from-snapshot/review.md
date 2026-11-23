# Review: Restore auction from snapshot (FEAT-001, FEAT-002, fixer a12f0e1)

**Verdict**: APPROVED

Restored rooms open with the snapshot purses as authoritative budgets, restored players are SOLD at creation and never enter the pool, and claims bind one user to one team. The medium finding from the previous pass (unclaimed sentinel in host team presence) is fixed in a12f0e1 and covered by a test. Two low items remain (archive placeholder price, results PDF price fallback).

Watch for: restored purchases archive with a placeholder final price (base price), so archive rows cannot be told apart from real prices without the snapshot JSON (confirmed, low).

## High-level view

Purses: `buildRestoredRoom` sets `startingBudgetUnits = toUnits(purseCr)` and `spentUnits = 0`. Restored purchases carry `priceUnits 0`, enforced by an `assertRoom` invariant. Nothing deducts or derives a price, and `UPDATE_SETTINGS` in both the engine and `room.service` skips the "reset every team budget" loop for restored rooms. `startingBudgetCr`, `maxSquadSize`, `numberOfTeams`, `playerPoolSource` and `retention` are locked by `assertRestoreSettingsUnlocked`, so a settings PATCH cannot overwrite purses (confirmed).

Pool: START_AUCTION keeps every SOLD player in `room.players` and excludes their ids from the FC26 pool. The restore pool route applies the same exclusion (confirmed). Restored players cannot be auctioned again.

Limits: bidding uses `getMaximumPermittedBid`, which returns 0 at 20 players and is `remaining - reserve` otherwise. DDD at 17 squad and 0 Cr gets a maximum bid of 0, and a 20-player team gets 0. No new bid code was added, so the existing validation applies (confirmed).

Claims: restored-room join requires `restoredTeamId`. The code finds the user's existing team and rejects a different target with ALREADY_CLAIMED_ANOTHER_TEAM. It rejects an already claimed target and allows joins only in the lobby. `assertRoom` also asserts unique `userId`s per room. Leave and kick on restored rooms release the claim and keep the team. Both are lobby-only, so a team never loses its squad.

Sentinel: `publicTeam` masks the sentinel as `userId ''` plus `claimed`. `teamPresence` now omits `userId` for unclaimed teams. START_AUCTION is blocked while any team is unclaimed (RESTORE_TEAMS_UNCLAIMED). The archive and live auction therefore never see a sentinel (confirmed). I grepped `.userId` across realtime, rooms and auction. The remaining uses are lookups, not outputs.

Normal flow: every restored branch is guarded by `room.restore` or `restoredTeamId`. The join schema for a plain body is still `joinSchema.strict()`. The kick, leave and settings paths are unchanged when `room.restore` is absent.

Other workflows: the diff to `room.manager.ts`, `auction.engine.ts` and `hub.ts` is additive (+17, +10/-2, +3/-1). No Part 9 or fix-429 hunks are removed.

Encoding: all 42 changed files decode as strict UTF-8, with no U+FFFD or mojibake added. The template has 8 teams and 99 players (accents intact, e.g. "H. Çalhanoğlu"). Retained counts are 0/1/0/3/2/1/3/1, which matches the brief.

Evidence: the FEAT-001 and FEAT-002 records and the fixer commit message list the checks (backend tsc, restore and presence tests 41/41, frontend typecheck, next build, restore-ui). The known baseline failures are named. I did not re-run the suites, as instructed.

<details>
<summary>Issues (2)</summary>

1. **Archive placeholder price** (low, confirmed) — `archiveFinalPriceUnits` writes the player's base price as `final_price_units` and `price_units` for auction-acquired restored players. Flag restored rows (for example via the archived runtime snapshot's `restore` record, which is already stored) or relax the positive-price check for restored purchases.
2. **Results PDF price fallback** (low, likely) — `resultsPdf.ts` uses `soldPrice` for top signings and totals. Restored players have a null price, so the PDF shows `-` or 0 rather than "Restored". Treat restored rows explicitly. The team PDF is already fixed.

</details>

<details>
<summary>Details</summary>

### Purse authority and ledger

The opening purse is stored per team in `room.restore.teams[].purseUnits`. `assertRoom` compares `startingBudgetUnits` to that value instead of the settings default. The remaining budget after a purchase is `purse - price`, so the first post-restore sale deducts from the restored purse and increments the squad count. The tests cover this per the commit record.

### Squad cap at 20

`maxSquadSize` is fixed at 20 and locked. The validation marks a squad over 20 as CRITICAL, and the engine's maximum bid is 0 once the squad reaches 20. `minSquadSize` is 11. The reserve is `(11 - squad - 1) * minBase`, so FidoDido (9) reserves one minimum base for a prospective signing. This follows the existing rule and does not conflict with the brief.

### Pot start

The auction starts with the normal pot order and does not force "Attackers, Round 1". This is a documented decision, which the brief allows.

</details>

## File map

<details>
<summary>Files</summary>

backend: restore module (build, claims, matcher, routes, schema, types, validate), domain/types, auction.engine, squad.service, completed-auction-archive, room-state, room.manager, room.routes, room.service, team.service, schemas/settings, hub, app, data/restore template, tests/restore.test.ts.
frontend: create, join and room pages, restore components (workflow, lobby panel, pool panel), restore service and types, contract, room.service, auction components (null-safe price), teamPdf, tests/restore-ui.mjs.
Full diff: `git diff 5b1ac94^ HEAD`.

</details>