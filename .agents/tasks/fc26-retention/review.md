# FC26 database source, Underdog pricing and pre-auction retention (review pass 2)

Covers `7a1b276..HEAD` (commits 5f4c241, 44ab6d0, a8026c8, de03e33, 8349835) plus untracked new files. The suites were not re-run. Evidence comes from the commit messages and the code.

The server-side FC26 catalog, the 1/3/5 Cr pricing, the UNDERDOG tag and the retention sub-phase of LOBBY are in place. Both findings from pass 1 are fixed in 8349835. No blocking concern remains.

Watch for: the full vitest run shows two extra timeouts (cups, manager-mode) under load, and both pass alone (possible flake, unrelated modules).

**Verdict**: APPROVED

## High-level view

Retention is a sub-phase of LOBBY inside the room aggregate. Each pick is a 30-unit SOLD purchase with `acquisitionType: RETENTION`, so purse, squad and budget invariants in `assertRoom` apply unchanged. Every write goes through `RoomManager.mutate`, so two retains of the same player serialize under the room lock, with a unique `(room, player)` ledger constraint as a backstop.

Retention OFF and the DEFAULT source take the original START_AUCTION branch, and the existing START code is only re-indented inside the new `else`. The pass-1 risk was legacy snapshots without `settings.retention`. `ValidatingHydrator.hydrate` now runs `settingsSchema.parse` before `assertRoom`. Every load path (`loadRoom`, `recover`, persistence reconciliation) goes through the hydrator, so `retentionPhase()` and `roomState` always see `retention: {enabled:false}` for old rooms. A new test hydrates a snapshot with both keys deleted.

The START_AUCTION gate throws `RETENTION_NOT_FINALIZED` while the phase is OPEN, and treats "enabled with no retention record" as OPEN. In the FC26 branch the pool excludes SOLD ids, so retained players are never WAITING, never activated and never recalled. Base prices are recomputed from rating and draft pool at START and at retain time.

The migration and the apply script exist, and the script is dry-run by default. No boot or test path applies the migration, and the commit messages state it is not applied.

<details>
<summary>Issues (2)</summary>

1. **Load-sensitive timeouts in unrelated suites (possible, informational)**: the last full run reports 8 failures, which are the 6 baseline ones plus the cups and manager-mode tests timing out under load. Both pass alone together with retention.test.ts (63/63). Confirm they are timing flakes on a clean run before relying on a green suite.
2. **Underdog precedence on dedupe (possible, informational)**: a player in both a regular file and the Underdog file becomes UNDERDOG at 1 Cr, per plan D4, and is reported as a skipped duplicate. Confirm the intent with the product owner.

</details>

<details>
<summary>Details</summary>

### Legacy snapshot fix (pass-1 finding closed)

Pass 1 flagged `room.settings.retention.enabled` reads on rooms saved before this change. The hydrator now normalizes `copy.settings` through the schema on a cloned room before asserting invariants. The backend reads of `retention.enabled` therefore cannot hit an undefined key. The CRLF churn in `WEBSOCKET_PROTOCOL.md` is also fixed (16 changed lines, 8+/8-).

### Requirement walk-through

- **Retention OFF/default unchanged**: `retentionPhase` returns `OFF` when disabled, the gate passes, and the default pool branch is untouched. New settings default to DEFAULT and `{enabled:false}`.
- **Backend-enforced rules**: the order is LOBBY, enabled, phase OPEN, player in the server catalog, not already retained, under 3 picks, squad below max, purse of at least 30 units. The client sends only `playerId`. The price and limits are server constants, and the settings schema accepts only `enabled`. Settings that affect purses are locked once picks exist (`assertRetentionSettingsUnlocked`). Kick and leave release picks while OPEN and are rejected after finalize. Closing the lobby resets picks.
- **Concurrent same-player retention**: serialized by the room lock and CAS commit. A concurrent test exists. The ledger has unique constraints as a DB backstop.
- **Purse and reset math**: `spentUnits` carries the 30 units, `startingBudgetUnits` is unchanged, and `resetRetentions` reverses purchases, squad ids, SOLD entries and spend. `assertRoom` ties picks to purchases and enforces the 3-per-team cap.
- **FC26 import, dedupe, tag and pricing**: per-file reporting of missing, unreadable and invalid files. Dedupe is by `player_id` across files. The Underdog file is accepted under both names. `draft_pool` and `player_tag` are stored values set from the file origin. Prices (1/3/5 Cr, threshold 90 with env override) live only in `domain/pricing.ts`. The five FC26 pots are used, and Underdog players share them.
- **UNDERDOG surfaces**: PlayerCatalogPreview, RetentionPlayerCard, RetainedPlayersPanel, PlayerAuctionCard, PlayerPoolSidebar, RecallPlayersModal, Sold and Unsold overlays, TeamQuickView, TeamViewDrawer, SquadFormationView, AuctionHighlights and TransferTable all import `UnderdogTag`. The FEAT-003 findings state that CurrentBid, TeamPanel and TeamResultCard render no player names.
- **Migration not applied**: confirmed from the file list, the dry-run-default script and the commit messages.
- **Regressions**: the recorded runs show tsc passing, `npm run typecheck` passing and `next build` passing at FEAT-003. The only failures beyond the six baseline ones are the load timeouts above. 8349835 changed no frontend code.

</details>

<details>
<summary>File map</summary>

- `backend/src/domain/{pricing,retention}.ts`: central prices and fixed retention constants
- `backend/src/modules/fc26/*`: config, importer, catalog, positions, routes
- `backend/src/modules/retention/*`: pure retention rules and write-behind ledger
- `backend/src/modules/auction/*`: commands, START gate, invariants
- `backend/src/modules/rooms/room.manager.ts`: hydrator now normalizes settings
- `backend/src/schemas/settings.ts`: `playerPoolSource`, `retention.enabled`, `parseSettings`
- `backend/tests/{fc26-import,fc26-pricing,retention}.test.ts`: new coverage, plus a legacy-snapshot case
- `frontend/src/components/{retention,fc26}/*`, `shared/UnderdogTag.tsx`: retention screen, import panel, tag
- `supabase/migrations/20261001090000_fc26_database_retention.sql`: additive migration, not applied

Full diff: `git diff 7a1b276 HEAD`

</details>
