# External free-agent pool and practical pricing

Generated file: `backend/data/manager-mode/external-players.csv`.
This CSV is automatically imported when a new Manager Mode is created. The optional upload adds additional players, with stable-ID deduplication against the auction and default seed. Existing tournaments are not automatically backfilled. All 357 default rows pass validation and become unowned EXTERNAL_POOL free agents. See [Manager Mode updates](MANAGER_MODE_UPDATES.md) for release cooldowns, realtime notifications, and the setup deployment fix.

## Reproducible extraction

Run `python scripts/build-external-pool.py` from the repository root (Python 3, standard library only). Optional flags: `--source`, `--auction-dir`, `--output-dir`.

Inputs default to `frontend/male_players.csv` and the five pool files under `backend/data/default-pool`: gk, def, mid, att, default-player-pool. Audit/removal CSVs are deliberately not treated as auction pools. The auction inputs are never modified.

The source contains career records across multiple editions. Generation reuses the existing structured classifier, requiring FC24 career provenance and valid club/league identity. It rejects Icon/Hero/special flags, unknown card classifications and ambiguous records. There is no name blacklist. Stable person IDs are used; item/card IDs are not used for identity. The latest regular FC24 update wins before applying the inclusive 79 OVR threshold. Missing or conflicting identity is quarantined rather than guessed.

Results:

| Category | Count |
|---|---:|
| Full source records | 180,021 |
| Other editions excluded | 161,671 |
| Quarantined FC24 records | 87 |
| Auction players excluded | 288 |
| Below 79 excluded | 17,618 |
| Special/Icon/Hero records detected in FC24 | 0 |
| Duplicate regular FC24 records removed | 0 |
| External players generated | 357 |
| GK / DEF / MID / ATT | 58 / 110 / 140 / 49 |

Exclusion counts use mutually exclusive stages: an auction player is counted as auction-excluded before rating filtering. Diagnostic rows cover FC24 exclusions and problematic records; other editions are counted in the JSON summary. Output is sorted by OVR descending, name ascending, then stable ID. The source has no portrait URLs, so image_url remains empty instead of inventing URLs. Actual positions, category, stats, club, league, nationality, foot, age and tier are preserved.

Reports: `external-player-generation-report.csv` and `external-player-generation-summary.json` beside the output file.

## Pricing

The backend now uses the requested baseline bands in Cr:

| OVR | Baseline range |
|---|---|
| 79–80 | 1–3 |
| 81–82 | 2–5 |
| 83–84 | 4–7 |
| 85–86 | 6–10 |
| 87–88 | 9–14 |
| 89+ | 12–18 |

Within each band, age, position, stats and deterministic player variation affect valuation. Personality changes preferred values modestly; ideal values are approximately 20% above preferred values. Unsold players get another 10–20% discount before integer-unit rounding. All returned amounts are integer half-crore units.

Interest and affordable rival offers raise negotiation expectations by at most 35%; the competitive ideal cap is 160% of the original preferred value. A huge rival offer cannot multiply prices without bound. Rival interest can still cause WAIT/CONSIDER through the existing backend decision rules. Groq remains wording-only and receives no hidden financial thresholds.

Existing free-agent profiles are repriced in server views and persisted on their next tournament mutation. Existing personality traits, historical dialogue/offers, accepted offer amounts, acquisition prices and budgets are preserved. No database migration or new environment variable is needed. Deploy the backend to activate the economy change.

## Delete and bonuses follow-up

The API CORS method list now allows DELETE, and the frontend does not attach a JSON Content-Type to bodyless requests. Deletion removes dependent negotiations, trades and transfer ledger rows inside the existing tournament transaction before removing the tournament. Source auctions and user profiles are retained. Redeploy both Render and Vercel for this fix.

Season bonuses are positive for every final position, ordered non-increasingly by performance. Host configuration cannot assign zero; existing zero settings use a positive floor for future awards. Existing awarded rewards stay immutable and cannot be paid twice.

## Verification

Focused extraction tests cover the 79 boundary, stable identities, duplicate/latest records, special-card flags, invalid positions and old editions. Backend tests import the actual generated file, verify zero auction overlap, constrain all personality/OVR price bands, and cap extreme competition. Manager Mode regression tests cover DELETE preflight, host permissions, source-auction preservation and rewards for every finishing team.

Verification completed: 61 targeted backend tests, nine Python extraction/classification tests, the API-client regression test and both production builds passed. The isolated real-Postgres test passed legacy repricing, accepted-offer preservation and deletion with negotiation/trade/buyout dependencies; the source auction remained intact and all test fixtures were removed.
