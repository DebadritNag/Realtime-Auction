# Live auction room layout fix (two local commits, cf76fb6 and 7a7a166)

The commits make the live room fill the viewport, collapse the host connection table into a one-line `8/8 connected` toggle with a popover, and compact the chrome at short heights. The second commit addresses the earlier review: the 1024x500 view now keeps the player photo, position and badge. The screenshots confirm the grid fills the screen with no dead space, and the pot tabs show no scrollbar. Nothing was pushed.

Watch for: the mobile layout puts the bid console below the first screen at 375x812 (confirmed, minor). Truncated labels remain at 1024x500: "Skip ..." and "Squad 0-0..." (confirmed, cosmetic). No test covers focus rings or reduced motion (confirmed).

**Verdict**: APPROVED

## High-level view

The host connection panel is a button with `aria-expanded` and `aria-controls`, collapsed by default. Its table opens in an absolutely positioned popover that closes on Escape or an outside click. At 1024x500 it is a single control in the host bar, next to the action buttons, and no longer dominates the screen.

From 1024px up the workspace is `100dvh` with a `min-h-0` grid. The three columns fill the remaining height and scroll internally. Two height tiers (920px and 620px) compact the header, purse strip, host bar and bid console. In the 1024x500 screenshot, the paused host view shows the photo placeholder, "Declan Rice", OVR 87, the CM position line, the UNDERDOG badge, the stats row, the bid console and the quick-raise row (+1, +3, +5) without scrolling the page or the center column. The left column shows four player rows. The right column fills its height and scrolls internally. The previous version hid the portrait, position and facts at this size. That is fixed.

At 375x812 the layout stacks header, host controls, collapsed connections button, player card, then the bid console. The player card is visible on the first screen. The current-bid panel starts at the bottom edge, so quick-raise needs a page scroll on mobile. The task asks for the current player and bid first in order, and the order is correct. The host button stack takes about 190px of the first screen.

`auction-layout-ui.mjs` covers 4 viewports across host paused restored, host live, guest and retention-off rooms. Per the commit message, it now also asserts photo, position, badge, at least 4 pool rows, no fixed elements, and all host buttons. The commit message records typecheck, build and eight UI suites as passing. I did not re-run them. `git log origin/master..HEAD` lists only 7a7a166 and cf76fb6. `origin/master` equals the base 07725d2, so no push happened. The floating icon and pill in the user's screenshot are reported as Next dev indicators, and the test asserts no fixed app elements.

<details>
<summary>Issues (4)</summary>

1. **Quick-raise below the fold on mobile** (confirmed) — at 375x812 the bid console starts at the bottom edge. Consider a more compact host button stack on mobile, or accept it as the spec's "player + bid first" order.
2. **Truncated labels at 1024x500** (confirmed) — the "Skip ..." button and long pool names ("Squad 0-0...") are ellipsized. Use a shorter label ("Skip") at the short tier.
3. **Stray CSS formatting** (confirmed) — `}@media (prefers-reduced-motion:reduce)` sits on one line after the last block in `auction.css`. Put it on its own line.
4. **Focus and reduced-motion untested** (confirmed) — the reduced-motion rule is kept, but no test checks visible focus or that rule. Add a small assertion if cheap.

</details>

<details>
<summary>Details</summary>

### Short-height tier
The 620px tier now shrinks elements (portrait 40x46, smaller type) and hides only secondary content: the facts row, base-price line, bid limits and rules, and the left-hand pot label. The player identity stays visible, which meets requirement 4. The duplicated CSS rules from the first pass are removed.

### Connection popover
It opens over the center column with z-30 and closes on Escape or an outside click. `connection-ui.mjs` was updated for the collapsed state. Mobile uses the list layout inside the popover.

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