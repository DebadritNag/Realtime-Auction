# Sequential retention page, announcement overlay, retained visibility and live auction redesign (frontend)

Commit 277de95 adds the dedicated `/room/[roomCode]/retention` page, a global announcement overlay (states A/B/C) fed by backend retention events, a Retained Players tab and RETAINED badges, and splits the live auction screen into header, purse strip, player stage, bidding panel, activity feed and squad overview. All retention state (active team, draft, purses, reservations, phase, host-only actions) is read from the `ROOM_STATE` snapshot, and every mutation goes through `retentionService` to the server. Watch for: the `/3` cap is hardcoded in several display components instead of reading `retention.config.maxPerTeam` (confirmed, minor); UI tests run against a fake in-memory server in `retention-fixtures.mjs`, so they do not prove contract compatibility with the real backend (likely, minor).

**Verdict**: APPROVED

## High-level view

The retention page is a thin renderer. The active team's manager sees `ActiveSelection`, other teams see `WaitingView`, a team that has confirmed sees `HandoverView`, and all-complete shows `SummaryView`, chosen purely from `retention.phase`, `canAct` and `turns`. Search and position filters call the backend player endpoint, and the list refetches when `reservedPlayerIds` or the own draft change, so a reserved player disappears for other teams without client-side bookkeeping. Confirm, skip, remove, finalize, reset and host-skip are all server commands with the server's error message surfaced.

Announcements come from the existing WebSocket stream (`RETENTION_TEAM_CONFIRMED`, `RETENTION_ALL_COMPLETED`) plus the persisted `turns`/`completion` in `ROOM_STATE`. The store dedupes by backend event id, keeps a per-room, per-user seen set in localStorage, and on reconnect announces only turns younger than 15 s (older ones are marked seen silently). Nothing is announced before the backend sends it, and unconfirmed drafts are never part of the payload.

The auction screen is reorganised into tabs (Live, Retained Players, Teams and Squads) with every panel kept mounted, so switching never touches bidding state. A compact bid bar stays visible off the Live tab. The activity feed is filled only from backend-confirmed events. Retained vs auction-acquired is shown by `AcquisitionBadge`, `SquadOverview` and `PurseBreakdown`.

<details>
<summary>Issues (5)</summary>

1. **Hardcoded retention cap in display** — `RetainedPlayersPanel.tsx:36`, `RetentionAnnouncementOverlay.tsx:52,79` render `/3` literally while the rest of the page uses `retention.config.maxPerTeam`. Read it from the snapshot (confirmed, minor, display only).
2. **Fake-server UI tests** — `tests/retention-fixtures.mjs` re-implements the sequential rules (`applyCommand`) for the headless-Chrome tests. They verify rendering and wiring, not backend contract compatibility; rely on the backend suite and a manual end-to-end pass for the real flow (likely, minor).
3. **Not run in this environment** — `overview-ui`, `formations-ui`, `manager-mode-ui` could not start and `auction-ui.mjs` needs Supabase env, per the commit message. The auction page was heavily modified (+287 lines), so run `auction-ui.mjs` where env exists (confirmed gap, recorded by coder).
4. **Freshness heuristic on reconnect** — announcements older than 15 s are silently marked seen, so a client offline longer than that never sees the overlay for a turn it missed. State is still correct on the page (possible, by design).
5. **Finalize lands on the lobby** — after finalize the retention page redirects to `/room/[roomCode]`, where the host starts the auction. This matches plan decision D7 and the existing flow; note it in the final report (informational).

</details>

<details>
<summary>Details</summary>

### Server authority on the retention page

`RetentionScreen` derives the active team, slot count, purse and spend from `retention.teams`/`ownDraft`, and only shows the selection UI when `retention.canAct` is true. Skip-for-active-team is gated on `canSkipForActive`, finalize on `isHost` and `phase === ALL_TEAMS_COMPLETED`. Disabled-button reasons ("Retention limit reached", "Not enough purse") are advisory; the backend still enforces them. No retention data is hardcoded in components; fixtures with team names and players exist only under `frontend/tests/`. The page redirects out when retention is off, NOT_STARTED or FINALIZED, and to the auction/results route when the room is running or completed, so a refresh lands on the correct screen from the snapshot alone.

### Announcement pipeline and dedupe

`offerAnnouncement` checks `retentionSeen` before queuing and persists the id immediately, so the live event and the later `ROOM_STATE` replay of the same turn cannot double-show. `RETENTION_RESET` clears the current and queued announcements. The overlay respects reduced motion per the commit, is a modal dialog with Escape, close button, backdrop click and auto-dismiss (9 s / 12 s), and skips confetti for the skipped state. The completion body links to the retention summary.

### Auction redesign

Panels use `hidden` instead of unmounting, which keeps the timer and bid state intact when the Retained Players tab is open. Bidding rules are untouched: `BiddingPanel` still passes `minimumNextBid`, `maximumPermittedBid` and `biddingOpen` from the snapshot to the existing `AuctionControls`.

### File map

<details>
<summary>Files</summary>

Retention page, `RetentionScreen`, `RetentionViews`, `RetentionStatusCard`, `RetentionTeamSwitcher`, `RetentionFilters`, `RetentionPlayerCard`, `RetainedPlayersPanel`, `RetentionAnnouncementOverlay(.css)`, `lib/retention-announcements.ts`, `auction.store.ts`, `types/backend.ts`, new `components/auction/*` (Header, PurseStrip, PlayerStage, BiddingPanel, ActivityFeed, SquadOverview, Overview), `AcquisitionBadge`, `PurseBreakdown`, results/team components, and tests `retention-ui`, `retention-overlay-ui`, `retained-panel-ui`, `auction-redesign-ui`, `retention-fixtures`, `ui-harness`.

</details>

</details>