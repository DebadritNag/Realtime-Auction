# Unanimous participant skip voting

Implemented a secondary Skip Player control beneath the live bid controls. Non-host members can cast one vote or remove their vote. All clients see the server's vote count. The host retains the separate Mark Unsold control and has no voting button. The UI shows pending/error states, disables voting while disconnected or paused, and shows subtle feedback when a valid bid clears votes.

Fastify commands: VOTE_SKIP_PLAYER and REMOVE_SKIP_VOTE. Both carry roomCode, playerId and the server activationId plus optional requestId. The activation identifier prevents a delayed vote applying to a recalled appearance of the same player. Existing authentication, command idempotency, rate limiting, persistence and room locks are reused.

SKIP_VOTE_UPDATED broadcasts count changes. Personalized ROOM_STATE carries the count, required membership total and whether the current user voted. Refresh/reconnect restores the vote. Presence changes never reduce the denominator.

Unanimity emits PLAYER_UNSOLD with UNANIMOUS_SKIP, persists the reason, resets votes, and schedules the next normal random player after the transition delay. The existing overlay identifies the player as unanimously skipped. The player remains available to Recall Player. No budget changes occur.

## Explicit rules

- Every non-host room member counts, including temporarily disconnected members.
- Existing room rules prohibit permanent leave/kick after auction start; those actions remain rejected, so live membership threshold changes cannot occur in this version.
- Votes do not pause bidding or the timer.
- An accepted bid clears all votes; new voting is unavailable after a bidder exists. Accepted purchases cannot be discarded. Invalid bids leave votes intact.
- Pause preserves votes but disables cast/remove. Resume restores voting if no bidder exists.
- Resolution is locked, persisted and then broadcast. Late commands fail; duplicate retries cannot add extra votes.
- Unanimous skip advances even in ordinary host-next mode. No remaining waiting players means the host chooses recall or end.
- No schema, pricing, tiers, authentication, team budgets, random selection algorithm, PDF or Team View changes.

## Files

Created:
- backend/src/modules/auction/skip-vote.service.ts
- backend/tests/skip-vote.test.ts
- frontend/src/components/auction/SkipPlayerVote.tsx
- frontend/tests/skip-vote-ui.mjs
- SKIP_VOTING.md

Modified:
- backend/src/domain/types.ts
- backend/src/modules/auction/auction.schemas.ts
- backend/src/modules/auction/auction.engine.ts
- backend/src/modules/auction/squad.service.ts
- backend/src/modules/rooms/room-state.ts
- backend/tests/integration.test.ts
- backend/WEBSOCKET_PROTOCOL.md
- frontend/src/types/backend.ts
- frontend/src/stores/auction.store.ts
- frontend/src/components/auction/UnsoldOverlay.tsx
- frontend/src/app/auction/[roomCode]/page.tsx

## Verification

Nine domain tests cover unanimity, cancellation/duplicates, pause/expiry/permissions, accepted/invalid bids, concurrent bid/skip, stale recalled activations, zero/one voter, membership policy and hydration/persistence failure. The WebSocket test uses a host and three peers, reconnects after two votes, verifies unanimous unsold for every client, then verifies a bid reset on the next player. The isolated browser component test checks controls and feedback; it uses a test transport, not production data. Backend and frontend TypeScript checks pass.

Deployment: redeploy backend first, then frontend. No new environment variables. The frontend hides skip voting until a backend snapshot provides the new fields. Production deployment was not performed.

Final checks: all 66 backend tests passed; the headless browser component test passed; backend TypeScript/build and frontend production Webpack build passed. Targeted ESLint had no errors (the unused import warning was removed).
