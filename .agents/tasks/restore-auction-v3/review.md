# Restore preset v3: auto-load on toggle, recorded prices

Turning the restore toggle ON mounts `RestoreWorkflow`, which immediately loads the default 8-team, 75-player preset into the existing preview. Recorded auction prices are carried as history on each purchase and shown and archived, while purses stay authoritative.
Watch for: no blocking issues. Position-distribution and dashboard updates after a post-restore purchase are not asserted by the new tests (possible gap). The commit bundles stray task artefacts under `.agents` (confirmed).
**Verdict**: APPROVED

## High-level view
The preset is a shipped JSON template read from disk per request and never written by room activity. The templates route sorts it first and flags it `isDefault`; the old 99-player template stays selectable via a dropdown. `loadTemplate()` runs on mount and replaces text, preview, managers and expanded state, with a sequence counter discarding stale responses. OFF unmounts the workflow, so OFF/ON replaces rather than appends.

Optional `priceCr` (0.5-Cr steps) flows from snapshot to preview to `Purchase.recordedPriceUnits`. Retained entries are forced to 15 Cr (a different listed value only warns). `priceUnits` stays 0 for restored purchases, so purses are never recomputed from prices. The archive helper already preferred `recordedPriceUnits`; frontend squad, drawer, sidebar, quick view and PDF show the recorded price and fall back to "Restored".

I checked the preset file directly. It has the 8 required team names, purses 79.5/44/62/63/67/42.5/53/13.5, squads 6/10/6/10/6/15/8/14, slots 14/10/14/10/14/5/12/6 and retained 1/2/2/0/0/1/2/2. Names are 75 and unique, 10 retained at 15 Cr, every player priced, no ids or sofifa ids, and no formation, lineup or tactics fields. The tests assert all 75 match the catalog, so nothing is unmatched and nothing is invented. Host resolution remains the path if a catalog change breaks a match.

<details>
<summary>Issues (3)</summary>

1. **Stray artefacts committed** (confirmed) - v2 report files and `gen-preset.mjs` under `.agents` are in the commit range; drop them if unwanted.
2. **Name-only matching** (possible) - the preset has no ids, so a catalog update could leave a player unresolved; the host resolver and critical-issue gate cover it.
3. **Post-purchase dashboard/position distribution unasserted** (possible) - tests cover purse, squad, slots and template immutability but not position distribution or dashboard; add an assertion if desired.

</details>

<details><summary>Details</summary>

The purchase test confirms a post-restore purchase deducts from the restored purse, excludes all 75 from the pool and queue, and leaves the template unchanged. A restart test confirms purses, squads and recorded prices persist. Retention and prior restore tests still pass per commit message (49 passed). Backend tsc, frontend typecheck and next build pass per the coder's recorded results; the 6 skip-vote failures are baseline. The headless pool-paging assertion flaked once and passed on 3 reruns (possible, unrelated component).

</details>

<details><summary>File map</summary>

Full diff: `git diff ab4a8ac...HEAD`. Backend: v3 JSON preset, routes (default first, isDefault), schema/types/validate/build (priceCr to recorded price), tests. Frontend: RestoreWorkflow (auto-load, preset select), price label helper and views, types, contract mapping, PDF, UI test.

</details>