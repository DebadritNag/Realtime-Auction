# Live auction room layout fix (one local commit, cf76fb6)

The commit makes the live room fill the viewport, collapses the host connection table into a one-line toggle with a popover, and compacts the chrome at short heights. At 1024x500 the grid now fills the screen with no dead space and no page scroll. The current player's name and the quick-raise row are visible, and the pot tabs no longer show a scrollbar. It does not meet requirement 4 (photo and position) at the shortest height.

Watch for: the player card drops the photo and position line at 1024x500 (confirmed). The left column shows about three rows there (confirmed). The CSS has duplicate rules and one selector that may hide a host button (possible).

**Verdict**: NEEDS_CHANGES

## High-level view

The host connection panel is now a `8/8 connected` button with `aria-expanded`, collapsed by default. Its details open in an absolutely positioned popover that closes on Escape or an outside click. At 1024x500 it is about 30px tall, a large improvement over the old ~130px table.

From 1024px up the workspace is `100dvh` with a `min-h-0` grid, so the three columns fill the height and scroll internally. Two height breakpoints (920px and 620px) compact the header, purse strip, host bar and bid console. The 620px tier solves the clipping by hiding content. It hides the portrait, the position/"also" line, the facts row, the base-price line and the bid limits. Requirement 4 says the player header (photo, name, OVR, position, badges) must always be visible.

The pool tabs now wrap, or sit in one row with the scrollbar hidden on short screens, and the count badge no longer shrinks. The paused banner is compact. Mobile stacks player and bid first, and the host panel is collapsed.

The new `auction-layout-ui.mjs` covers the 4 viewports across host paused restored, host live, guest and retention-off rooms. It asserts the name in the viewport, the quick-raise button visible, no page or column scroll, the panel under 60px with `8/8 connected`, and no horizontal overflow. This matches the requested headless test. The commit message records typecheck, build and all UI suites as passing, and I did not re-run them. `git log origin/master..HEAD` shows only this commit and nothing was pushed. The untracked `.agents/tasks/restore-auction-v3/review.*` files are unrelated.

<details>
<summary>Issues (5)</summary>

1. **Player header content hidden at <=620px height** (confirmed) — at 1024x500 the screenshot shows no portrait and no position/"also CDM" line, and the facts row is hidden by `.live-player-facts,.live-player-portrait{display:none}`. Keep a compact portrait or position chip, or shrink them instead of hiding them. Assert that the position text is visible in the test.
2. **Left pool column shows about 3 rows at 1024x500** (confirmed) — the filter box and `auction-player-row{min-height:44px}` leave little room, and the requirement asks to show more rows. Tighten the filter and row height at short heights. The "POT & PLAYE..." title is also truncated, so shorten it or drop the icon.
3. **Floating elements not addressed** (likely) — requirement 7 (top-right icon button, bottom-center pill) has no CSS change and no test. The only fixed in-room element found is `PoolUpdateNotice` at bottom-right. Confirm which elements overlap content and add an overlap check.
4. **A host button may be hidden at short heights** (possible) — `.auction-host-controls button[class*="secondary"]:nth-last-child(2){display:none}` can remove a control and break the keep-all-functionality rule. Verify which button it hides, or move it to an overflow menu.
5. **Duplicated and leftover CSS** (confirmed) — the 620px block repeats the `auction-host-controls` and `live-player-identity` rules several times, and a stray block was added to the older mobile media query. Dedupe. Also fix the odd `host` expression in the test and the missing trailing newline in `HostConnectionPanel.tsx`.

</details>

<details>
<summary>Details</summary>

### Short-height compaction hides content (1024x500)
The test only asserts the name, the quick-raise button and the page and column fit. It does not assert photo, position or badges, so hiding them passes. The 1280x720 and 1440x900 screenshots are fine. Only the sub-620px tier needs rework.

### Connection popover
Collapsed by default, with `aria-expanded` and `aria-controls`, keyboard operable (tested with Enter), and the label hides on short screens while the aria-label keeps the full text. The z-30 popover covers part of the controls while open, and Escape closes it. The `connection-ui` test was updated for this.

### Not covered
No test checks focus rings or reduced motion (the CSS adds a `prefers-reduced-motion` rule). The `PoolUpdateNotice` overlap is untested.

</details>

<details>
<summary>File map</summary>

- `auction.css`: viewport-fill grid, height tiers, pool tabs, compact banner
- `page.tsx`: compact paused-notice class
- `HostConnectionPanel.tsx`: collapsible summary and popover
- `HostAuctionControls.tsx`: `host-return-btn` class
- `PlayerPoolSidebar.tsx`: tab container class and title attribute
- `tests/auction-layout-ui.mjs`: new layout test
- `tests/connection-ui.mjs`: updated for the collapsed panel
- `.agents/tasks/auction-ui-fix/*.png`: before/after screenshots

Full diff: `git diff 07725d2..HEAD`

</details>