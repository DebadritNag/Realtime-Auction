# FC24 default catalogue cleanup

## Diagnosis

The supplied `frontend/male_players.csv` contains 180,021 male career-mode records spanning FIFA 15–24. It is not identified as a FUT special-card feed. The old `scripts/convert-players.mjs` selected the latest available edition for each person across all years, admitting players absent from FC24. Its 760-row combined file took precedence over the separate 288-player category files.

Philipp Lahm (player_id 121939) was sourced from FIFA 17, OVR 88, Bayern; he has no FC24 record in this dataset. The old catalogue contained **187 players absent from FC24**, documented in `legacy-catalog-audit.csv`. This classification does not assert that every such player is retired. Lucas Ocampos (205632) has a valid FC24 Sevilla record at OVR 80 and remains in the new pool.

## Source fields and eligibility

All 109 source columns are listed in `data/default-pool/validation-report.json`. Key fields are `fifa_version`, `fifa_update`, `update_as_of`, `player_id`, `player_url`, `short_name`, `player_positions`, `overall`, `club_team_id`, `club_name`, `league_id`, `league_name`, and `nationality_name`.

The actual source has **no card_type, rarity, is_icon, is_hero, is_special or is_base columns**. Eligibility therefore requires FC24 (`fifa_version == 24`), career-player URL provenance for that person and edition, normal club/league identity, valid position, name and rating. Missing provenance or club/league records are quarantined. All FC24 records in this source are update 2, dated 2023-09-22. “Regular” refers to this FC24 snapshot, not the current football season.

If future input contains card type/rarity or boolean classification fields, the generator rejects Icon/Legend, Hero and special/promo classifications; unknown labels are quarantined rather than accepted. There is no player-name blacklist. Classification occurs before deduplication by person `player_id`. The newest regular FC24 update wins, never the highest special-card OVR. Conflicting records from the same update are quarantined.

## Audit totals

| Metric | Count |
|---|---:|
| Records read | 180,021 |
| Older edition records excluded | 161,671 |
| FC24 records examined | 18,350 |
| Explicit Icons removed | 0 |
| Explicit Heroes removed | 0 |
| Other explicit special cards removed | 0 |
| Duplicate FC24 person records removed | 0 |
| Suspicious FC24 records quarantined | 87 |
| Eligible regular players | 18,263 |
| Final selected | 288 |
| GK / DEF / MID / ATT | 24 / 84 / 84 / 96 |

The zero special-card counts are intentional: the observed contamination was historical seasons, not records carrying FUT classifications. Suspicious examples include J. Corona (80), A. Vega (79), L. Chávez (79), and H. Martín (79), whose source rows lack club/league information. No missing information was invented.

## Output and runtime

Regenerated `gk.csv`, `def.csv`, `mid.csv`, `att.csv`, and `default-player-pool.csv` from the same canonical selection. Primary and secondary positions remain intact. Existing positional quotas and descending normal OVR ranking are preserved. Existing tier thresholds remain ELITE ≥90, PREMIUM ≥87, STRONG ≥84, GOOD ≥81, otherwise VALUE; prices are respectively ₹9/7/5/2/1 Cr.

Audit files:
- `data/default-pool/validation-report.json`: all source columns, hash, counts, examples and selection counts.
- `data/default-pool/removed-special-players.csv`: header-only because no explicit special cards were found.
- `data/default-pool/suspicious-players.csv`: all 87 quarantined records and reasons.
- `data/default-pool/legacy-catalog-audit.csv`: one-time audit of the 187 historical-only players in the previous committed combined catalogue.

Production startup and default `buildApp` now use only the verified combined CSV. Missing/unverified default files fail closed. The category fallback and implicit demo fallback are removed. `PLAYER_CATALOG_PATH` is retired/ignored so a stale deployment environment cannot redirect the Default Database to old JSON/CSV. Explicit repository injection remains available to tests. Fictional demo fixtures remain test-only. Repository search found no hardcoded Lahm in frontend/backend application code; he was present in the old combined CSV itself.

The runtime validates provenance markers, category counts, unique IDs, tiers and prices. The markers document generator validation, not external authenticity of arbitrary datasets. The source CSV is supplied locally and remains gitignored; generated curated/audit files are committed with the project.

## Regeneration

Run `python scripts/build-default-pool.py` with Python 3. Alternatively `node scripts/convert-players.mjs` delegates to that same generator; set `PYTHON` to the Python executable if it is not on PATH. Both commands write the five exports and generated audit reports together. No separate expanding/legacy converter remains.

## Verification and deployment

- Six Python classification tests passed: version exclusion, explicit categories/flags, base-vs-special rating preservation, unknown classification quarantine, person deduplication, ambiguous update quarantine.
- All 56 backend tests passed, including category identity, unique IDs, Lahm exclusion, Ocampos preservation, correct prices, failed fallback and existing auction/realtime tests.
- Backend TypeScript/build passed.
- No bidding, random-selection, timer, WebSocket, budgets, room setup or authentication behavior was modified.

Redeploy Render with these source/data changes. Vercel changes are not required for this cleanup. Existing rooms preserve their auction snapshots, including previously selected players: create a new room after redeploying to use the cleaned pool. Existing live auctions were not rewritten and production deployment was not performed.
