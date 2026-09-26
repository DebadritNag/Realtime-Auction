# Manager Mode implementation report

## Completed-auction setup error

The frontend calls GET /api/manager-mode/from-auction/:auctionId. Create is a separate explicit POST to that route; mounting the setup page never creates a tournament.

A concrete deployment defect was reproduced: backend/.gitignore ignored data/manager-mode/external-players.csv. The file existed locally, but Git-based Render deployments omitted it. Automatic seed loading therefore threw ENOENT, previously exposed as generic INTERNAL_ERROR / 500. The ignore rules now allow only the versioned seed in this folder; runtime files and generation reports remain ignored. The backend build validates the bundled CSV and fails if missing or malformed.

The loader resolves the file relative to its source/compiled module, so both backend/src and backend/dist resolve backend/data/manager-mode/external-players.csv on Windows and Linux. Optional MANAGER_MODE_EXTERNAL_PLAYERS_PATH overrides it. Missing/malformed defaults now return specific 503 configuration errors with step LOAD_EXTERNAL_PLAYERS; they do not silently omit the external pool.

Setup prefers the authoritative Fastify room over a potentially incomplete database mirror. Database-only recovery reads teams and pool independently, validates profiles and ownership mappings, and uses winning_team_id to determine ownership. Null-owner SOLD, UNSOLD, ACTIVE, WAITING, SKIPPED and recalled/unseen entries remain unowned. A winner without a valid team or price gets a descriptive 409. Missing auction is 404; unfinished auction is 409. No source/ownership enums were added, and no migration is needed for these fixes.

Safe structured diagnostics include auctionId, step, sanitized error message, PostgreSQL code and constraint. Auth headers, keys and connection strings are excluded. The UI displays the safe backend message, clears loading in finally, and offers Retry setup. scripts/diagnose-manager-setup.ts is a read-only diagnostic for recent completed auctions and relevant indexes.

## Free-agent sources and releases

Creation includes all auction-pool players: purchased players remain owned; every unowned player becomes a free agent. The 357-player default external CSV is imported automatically; optional uploaded rows are additive. Auction IDs and external identities take precedence over CSV duplicates. The source-auction unique creation transaction remains the idempotency boundary.

Original source remains AUCTION_SQUAD, AUCTION_UNSOLD or EXTERNAL_POOL, preserving database compatibility. metadata.freeAgentReason distinguishes AUCTION_UNSEEN and TEAM_RELEASE. Released-by team and release time are reconstructed from the immutable RELEASE ledger after restart, rather than adding redundant schema columns.

Selling validates the server quote/ownership token, credits reduced resale proceeds once, clears ownership, preserves player identity and history, closes stale offers and removes stale squad assignments in the existing transaction. The player returns to the free-agent list immediately. Free-agent valuation applies a 25% release discount before integer half-crore rounding; it does not reuse the old purchase price. Other teams can negotiate immediately through the existing deterministic engine, Groq wording/fallback and signing flow.

The releasing team cannot start talks, submit offers or confirm signing during the cooldown. MANAGER_RELEASE_RESIGN_COOLDOWN_HOURS defaults to 24; valid overrides are at least one hour. RELEASE and future FREE_AGENT_SIGNING remain separate ledger entries. This is a time-based cooldown, not a transfer-window counter.

## Realtime, privacy and performance

There is one existing app WebSocket. SUBSCRIBE_MANAGER_MODE accepts optional deltaUpdates:true. Initial subscription/reconnection returns MANAGER_MODE_STATE. Later MANAGER_MODE_PATCH payloads contain tournamentId, baseSequence and changed top-level slices; stale patches are ignored and sequence gaps request a fresh state. Older clients without the capability flag continue receiving full snapshots.

MANAGER_MODE_SUMMARY updates inbox metadata without REST refetches. NOTIFICATION_CREATED is user-scoped and deduplicated; reconnects do not replay old toasts. New release notices are MANAGER_PLAYER_SOLD, PLAYER_RELEASED, FREE_AGENT_POOL_UPDATED and TEAM_BUDGET_UPDATED. Existing auction PLAYER_SOLD is intentionally not overloaded with incompatible Manager Mode data.

Private trades/buyouts/negotiations are filtered on the server, including for hosts. Fixture notices target participating managers; rewards target their recipients. The bell and Manager Mode navigation share the store's authoritative unread total. unseenOffers contains deduplicated actionable private entity keys, independent of the recent-notification page. Offers are marked reviewed individually, not when entering Transfers.

New actions: READ_OFFER {entityType: trade|buyout|negotiation, entityId}, READ_ALL_NOTIFICATIONS, plus existing READ_NOTIFICATION. All reads affect only the authenticated user's records. The UI applies optimistic read state and resynchronizes after failure.

New GET endpoints:
- /api/manager-mode/:id/notifications?before=<notificationId>: 50 private records and nextBefore.
- /api/manager-mode/:id/history?kind=transactions|trades|buyouts|messages&before=<id>&sessionId=<id>: 50 authorized records. Conversation history requires the user's own session.

Initial state includes 100 recent notifications, 100 recent non-auction transactions, 50 closed offers per category plus active offers, and 40 recent messages/20 offers per conversation. Historical records remain persisted and available through Load older records. Aggregate sale-return totals remain authoritative despite history paging. Current auction acquisition records remain available for squad reconciliation.

The inbox now uses a compact database summary query instead of loading every tournament aggregate. Independent squad/season/buyout/negotiation reads run together. Stable player/team slices retain references on unrelated patches, and Squad rendering is memoized. The transactional repository still loads its authoritative aggregate internally; this change does not replace that persistence architecture or claim measured production latency improvements.

## Squad work completed alongside these fixes

Squad cards use real roster/financial/stat data, shared image fallback, per-player sale/renewal controls, and explicit sale confirmation. Team sheets support formations, bench, captain, keyboard/touch selectors and drag/drop. Saved lineups export as PDF. Scorer entry and immutable match-lineup snapshots drive current-season goals/appearances. Contracts are informational, ownership-scoped and renewable; no invented assists or historical appearances are added.

The previously applied migration 20260926025720_manager_squad_features.sql provides those squad tables. The release/pool/notification/setup changes above require no additional migration.

## Main files

Backend: free-agent-pool.ts, notifications.ts, setup-diagnostics.ts, manager.service.ts, manager.routes.ts, manager.schemas.ts, manager.repository.ts, postgres-manager.repository.ts, auction-snapshot.repository.ts, season.engine.ts, negotiation.engine.ts, valuation.service.ts, realtime/hub.ts, realtime/protocol.ts, server.ts, app.ts, scripts/verify-manager-pool.mjs, scripts/diagnose-manager-setup.ts, package.json, .gitignore, .env.example and the external CSV.

Frontend: ManagerSetup.tsx, ManagerSquad.tsx, ManagerTransfers.tsx, ManagerBuyouts.tsx, ManagerWorkspace.tsx, ManagerModeLayout.tsx, AppHeader.tsx, ManagerToasts.tsx, OfferReview.tsx, HistoryMore.tsx, useManagerHistory.ts, manager-notifications.ts, manager-mode.store.ts, websocket.service.ts and DTO/action types.

## Verification and deployment

Automated coverage includes source inclusion/deduplication/idempotency, concurrent release/one credit, same-team cooldown, restart metadata, other-team signing, private notifications/read controls, equal-timestamp history paging, history authorization, WebSocket patch reconciliation and full reconnect state. Browser checks cover Squad actions, formations/PDF, mobile layout, bells/offer badges, and setup error/retry without automatic POST. The generated PDF was rendered and inspected.

An isolated Supabase integration verified sheets/contracts/scorers, release/re-sign persistence, signing, notification reads, compact summaries and deletion; its fixtures were removed. A separate read-only check loaded the three latest real completed auctions successfully: 38 owned / 137 unowned, 6 / 169, and 16 / 159; each also validated all 357 default external players. Existing tournament/user, unread-notification, event and membership indexes were confirmed, so no new index migration was added. Final verification passed: 75 targeted backend tests across nine suites, backend production build with 357-player seed validation, Next.js production build, offline realtime-store regression, browser Squad/notification/setup-Retry checks, and PDF rendering inspection.

Deploy both Render backend and Vercel frontend. Ensure the change set includes backend/data/manager-mode/external-players.csv; no new Vercel variable is required. Render overrides are optional; the defaults work without them. No production deployment was performed by this task. New pool seeding applies to new tournaments; existing tournament history is not silently rebuilt. Player portrait downloads remain deferred at the user's request until an authorized source URL is supplied.
