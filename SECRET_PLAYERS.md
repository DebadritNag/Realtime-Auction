# Secret Players: anonymous slot market

The Hero catalogue is server-private in `backend/data/secret-heroes`. The original
`heroes.csv` and generated catalogue contain 54 players. The generated data has
only **name and position**. Heroes have no OVR or attribute ratings; the UI does
not show fake values or attribute placeholders. Normal match appearances/goals
still work. Portrait sourcing remains deferred; the shared silhouette is used.

`scripts/build-secret-heroes.py` uses reviewed historical CSV identities and
position-only web fallbacks. `provenance.json` records each source. Do not put any
of these files in `frontend/public` or import the catalogue into client code.

## Pool and purchase contract

The first authorized state load initializes the tournament's private pool if
needed. Fisher–Yates shuffling uses Node `crypto.randomInt`; random UUID slot IDs
and display order are persisted. All managers see the same stable anonymous order.
Claimed slots disappear without renumbering the remaining cards.

`GET /api/manager-mode/:id` and existing Manager Mode WebSocket snapshots/patches
include `secretPlayers`:

```json
{
  "availableCount": 54,
  "priceUnits": 90,
  "teamEligible": true,
  "claimed": false,
  "revealed": false,
  "playerId": null,
  "purchaseId": null,
  "slots": [{
    "secretSlotId": "opaque-uuid",
    "displayNumber": 7,
    "priceUnits": 90,
    "status": "AVAILABLE"
  }]
}
```

Authenticated purchase through the existing action endpoint:

```json
{
  "requestId": "client-generated-uuid",
  "action": {"type": "BUY_SECRET_PLAYER", "secretSlotId": "opaque-slot-uuid"}
}
```

The response is the authoritative tournament state. Success has `claimed: true`,
`teamEligible: false`, and an owner-scoped `purchaseId`. The selected slot—not a
new random draw—is purchased. Its identity can then be returned to its owner.

Postgres uses the existing tournament transaction plus slot/team row locks.
Player insertion, 90-unit debit, window-linked ledger, permanent claim and
request receipt commit together. A unique tournament/team claim prevents a
second Hero in any season. Same-user/request retries return committed state;
different payloads cannot reuse a request ID. Concurrent losers receive
`SECRET_PLAYER_ALREADY_CLAIMED` with HTTP 409.

## Reveal and recovery

`GET /api/manager-mode/:id/secret-player-purchases/:purchaseId/reveal` is an
authenticated, owner-only, non-mutating read with `Cache-Control: private, no-store`.
It returns the already-owned player and never charges money. Unauthorized users
cannot retrieve someone else's purchase.

The frontend uses explicit IDLE, PURCHASING, PURCHASED_UNREVEALED, REVEALING,
REVEALED and ERROR states. It retains an uncertain purchase's request ID in
session storage, scoped by tournament/team; this is not auction state authority.
Reveal has a 15-second request timeout, retry controls and a closeable native
dialog. The 2.8-second visual reveal has reduced-motion support. A refresh loads
the committed claim from Postgres and offers Reveal again.

`REVEAL_SECRET_PLAYER` remains a noncritical acknowledgement that makes the
identity public to other managers. Its failure does not block the owner's reveal,
undo a purchase or cause another debit; opening/retrying reveal can acknowledge
again. Unrevealed identities are redacted from other managers and host PDFs.

After purchase the server emits `SECRET_PLAYER_CLAIMED`,
`SECRET_PLAYER_POOL_UPDATED`, `TEAM_BUDGET_UPDATED`, and `SQUAD_UPDATED`, alongside
the existing authoritative state/patch broadcast. No Supabase Realtime is used.

## Transfer restrictions and errors

Heroes are permanently owned. Server guards reject selling, release, trades and
both sides of cash-plus-player buyouts. The database also rejects ownership/source
changes for Heroes. Their purchase is included in the exact transfer-window audit.

Handled errors: `SECRET_PLAYER_ALREADY_CLAIMED`, `SECRET_PLAYER_ALREADY_USED`,
`SECRET_PLAYER_NOT_FOUND`, `INSUFFICIENT_BUDGET`, `TRANSFER_WINDOW_CLOSED`,
`MANAGER_DATABASE_UNAVAILABLE`, and owner-scoped reveal failures. Safe diagnostics
log action, tournament/team/slot IDs, stages, database code and constraint; never
the hidden identity, token, SQL values or credentials.

## Verified 503 causes and deployment

The configured database was missing `manager_secret_heroes`, required non-null
OVR, and excluded Hero source/ledger/event types. The repository lacked the full
player/debit/ledger write, and negotiation-profile initialization attempted to
value unrated Heroes. All are corrected. Heroes bypass negotiations/Groq.

Migration `20260927073550_manager_secret_heroes.sql` was applied and registered
against the configured database. It adds private pool storage, constraints and
ownership protection. `backend/scripts/apply-secret-heroes-schema.mjs` applies and
verifies it on another configured database. Browser roles cannot select the pool.

Deploy the updated backend to Render and frontend to Vercel together. No new
environment variable is required. Existing `DATABASE_URL` independently wires
Manager Mode Postgres; changing auction `STORAGE` is unnecessary. This change has
not been pushed or deployed by Codex.

## Checks

- Backend Hero domain, authenticated REST and WebSocket tests: anonymous pool,
  contention, idempotency, access control, reconnect/restart, outgoing guards,
  later-season entitlement and audit reconciliation.
- Real configured Postgres: two simultaneous buyers, exact-once debit/ledger,
  reveal after a fresh connection, SQL ownership guard, correct window and RLS.
  Isolated fixtures were removed afterward.
- Browser harness: 54 cards, selected slot, failed purchase retry with same ID,
  failed reveal retry, successful animation despite acknowledgement failure,
  mobile overflow and no OVR/stat display.
- Broader backend suite has six separate skip-vote assertions that expect hosts
  to be excluded, while current auction code includes them. That rule is unchanged.
