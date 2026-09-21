# Selected player recall

The host control now shows **Recall Player (count)** immediately before the separate destructive **End Auction** button. It opens a compact modal with real unsold-player name, OVR, specific position (broad position fallback), club when available, and preserved base price. No missing statistics are invented.

Search matches partial player names or clubs, case-insensitively and immediately. Native checkboxes support single/multiple selection, select all filtered, and clear selection. Filtering retains selection; authoritative removal clears it. Closing unmounts the modal and clears local selections. A second confirmation step shows the count before submission. Pending actions cannot submit twice; errors remain visible and successful acknowledgement closes the modal.

The modal is mounted inside existing host-only controls. It is usable when synced in RUNNING/PAUSED, including with an active player, and disabled with no unsold players. Fastify independently enforces host/membership, room status, ownership of IDs, UNSOLD status, duplicate IDs and existing recall-queue membership.

## Contract and behavior

- Command: RECALL_PLAYERS with roomCode and playerIds in the existing requestId envelope.
- State: UNSOLD → WAITING → ACTIVE through the existing random category/player selector.
- Broadcast: PLAYER_RECALLED for each player, followed by full ROOM_STATE and COMMAND_ACK.
- Same accepted requestId is idempotent; a new request for an already recalled player fails without another transition.
- Original prices, tier assignment, random-selection implementation, bids, budgets and active timer remain unchanged.
- Append-only playerHistory records future unsold/recall events in existing room persistence; no schema change.
- End Auction, Team View, PDF export and authentication retain their existing behavior. Optional Recall Next was deliberately omitted.

## Files

Created:
- frontend/src/components/auction/RecallPlayersModal.tsx
- frontend/tests/recall-ui.mjs
- backend/tests/recall.test.ts
- RECALL_FEATURE.md

Modified:
- frontend/src/components/auction/HostAuctionControls.tsx
- frontend/src/app/auction/[roomCode]/page.tsx
- frontend/src/types/backend.ts
- backend/src/domain/types.ts
- backend/src/modules/auction/auction.schemas.ts
- backend/src/modules/auction/auction.state-machine.ts
- backend/src/modules/auction/auction.engine.ts
- backend/tests/integration.test.ts
- backend/tests/auction.test.ts
- backend/tests/recovery-auth-timers.test.ts
- backend/tests/auth-catalog.test.ts
- backend/WEBSOCKET_PROTOCOL.md

The older auction/catalog/timer tests were updated to assert the actual randomly selected player rather than a fixed first array entry.

## Validation

- All 54 backend tests passed, including six recall domain cases and a host/peer/reconnection WebSocket recall test.
- Backend and frontend TypeScript checks passed.
- Targeted frontend ESLint passed.
- Next.js production Webpack build passed.
- Browser component test covers search, checkbox persistence, bulk selection, confirmation/cancel, stale-selection pruning, errors, paused recall and separate End Auction (run with node frontend/tests/recall-ui.mjs).

## Deployment and limits

Redeploy backend on Render and frontend on Vercel together (backend first). No new environment variables or Supabase schema changes. Production deployment was not performed. The browser test isolates the UI transport; the separate WebSocket integration test validates real server delivery. Audit entries from older versions that were never recorded cannot be recovered retroactively.
