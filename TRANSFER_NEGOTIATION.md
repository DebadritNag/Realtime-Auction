# Transfer negotiations

## Authority and units

All money is integer half-crore units: 40 units = ₹20 Cr. The server validates membership, window, ownership, current budget and negotiation state. Acceptance reserves no cash or player: the manager must confirm, and confirmation rechecks everything. One signing transaction debits budget, changes ownership through the existing RPC, records the ledger, closes competing sessions and saves notifications. Trades exchange two players and never transfer cash.

## Deterministic evaluation

A stable SHA-256 seed from tournament/player IDs generates one persisted profile per free agent. Ten archetypes vary money, prestige, playing time, squad strength, patience, ego, loyalty, competitiveness, aggression and compromise. Market estimates derive from OVR, age, position, tier and source. Minimum, preferred and ideal values remain private.

Evaluation combines offer value, the club's top-eleven strength, recorded league results, same-position competition and relationship trust. Difficulty adjusts the threshold. Offers below the hard minimum cannot be accepted. Low offers reduce trust/patience and increase frustration; improvements increase interest/excitement. Decisions are REJECT, COUNTER, CONSIDER, ACCEPT, WAIT or WALK_AWAY. Stronger affordable rival offers can cause WAIT/CONSIDER. This is game logic, not a claim of realistic player valuation.

Offers have a 3-second cooldown. Walking away has a host-configurable 10–3600 second cooldown (default 180). Closing the transfer window suspends active/accepted sessions and blocks new offers/signings; reopening restores them. Conversation and offer history remain persistent. No automatic signing, bidding or simulated matches occur.

## Privacy

Only the authenticated manager receives their sessions, offers and conversations. Hidden financial thresholds and personality coefficients are excluded from REST and WebSocket snapshots, including audit details. New negotiation tables have RLS enabled and browser-role privileges revoked; Fastify is their only data path.

- PRIVATE: competing interest count only.
- SEMI_TRANSPARENT (default): count plus whether a higher rival offer exists.
- TRANSPARENT: also shows the highest affordable rival offer amount.

Completed transfer fees and ownership are public tournament history. Negotiation audit events omit offer/session details and store hashed command fingerprints, so existing event-table access cannot reveal private rival amounts. Hidden profiles and conversation records remain accessible only through Fastify.

## Action contract

POST `/api/manager-mode/:id/actions`, authenticated bearer token:

```json
{"requestId":"a-unique-uuid","action":{"type":"OFFER_FREE_AGENT","sessionId":"session-uuid","amountUnits":40}}
```

Actions:

- `START_NEGOTIATION {playerId}`
- `OFFER_FREE_AGENT {sessionId, amountUnits}`
- `END_NEGOTIATION {sessionId}`
- `CONFIRM_SIGNING {sessionId}`
- Host: `TRANSFER_RULES {difficulty, visibility, walkAwayCooldownMs}`
- Host: `WINDOW {open}`
- Existing `TRADE {offeredPlayerId, requestedPlayerId, parentTradeId?}` and `TRADE_RESPONSE {tradeId, response}`.

Responses are personalized authoritative tournament snapshots. Common errors include `TRANSFER_WINDOW_CLOSED`, `NEGOTIATION_COOLDOWN`, `OFFER_COOLDOWN`, `INSUFFICIENT_BUDGET`, `PLAYER_ALREADY_SIGNED`, `OFFER_NOT_ACCEPTED`, `SESSION_CLOSED`, `NEGOTIATION_PERMISSION`, `HOST_ONLY`, `REQUEST_ID_REUSED` and `MANAGER_DATABASE_UNAVAILABLE`. Retry uncertain requests with the same request ID. Server schema validates all fields.

## WebSocket events

`MANAGER_MODE_STATE` is the authoritative personalized snapshot. `MANAGER_MODE_UPDATED` refreshes the inbox. Additional committed event signals carry `{tournamentId}`, sequence and serverTime:

`NEGOTIATION_STARTED`, `NEGOTIATION_UPDATED`, `FREE_AGENT_OFFER_UPDATED`, `FREE_AGENT_ACCEPTED`, `FREE_AGENT_SIGNED`, `FREE_AGENT_SIGNED_ELSEWHERE`, `TRADE_CREATED`, `TRADE_UPDATED`, `PLAYER_TRANSFERRED`, `TRANSFER_WINDOW_OPENED`, `TRANSFER_WINDOW_CLOSED`.

Negotiation signals target only their manager; trade signals target the two managers; signed-elsewhere targets affected rival managers. Public signing/window signals go to tournament members. Signals are notifications, not financial deltas; render the preceding snapshot and never subtract a fee twice.

## Dialogue provider

The deterministic engine is unchanged. A read-only classifier describes committed offer history using FIRST_OFFER, VERY_LOW_OFFER, LOWBALL, FAIR_OFFER, STRONG_OFFER, STRONG_IMPROVEMENT, SMALL_IMPROVEMENT, REPEATED_LOW_OFFER, MATCHED_COUNTER, EXCEEDED_COUNTER and WORSE_THAN_PREVIOUS. Qualitative offer quality, improvement/lowball counts and squad-derived playing-time/club-strength categories accompany the context; raw hidden thresholds do not.

Configure these **on Render only**, never Vercel or NEXT_PUBLIC variables:

```env
NEGOTIATION_DIALOGUE_PROVIDER=groq
GROQ_API_KEY=<server-only-key>
GROQ_MODEL=openai/gpt-oss-20b
```

The local backend .env is configured. The example file contains no real key and defaults to templates. Available modes are template, groq and custom (the previous structured-endpoint adapter). Missing Groq credentials fall back to templates.

Groq uses its chat-completions endpoint with JSON object mode and application-side validation. The default model was confirmed through the account's models endpoint and a live synthetic dialogue request. See [Groq model documentation](https://console.groq.com/docs/model/openai/gpt-oss-20b) and [JSON output documentation](https://console.groq.com/docs/structured-outputs).

The backend commits its result, releases the lock and broadcasts the authoritative snapshot before requesting wording. Groq has a 3-second HTTP timeout; the safety wrapper has a 3.5-second deadline even for an unresponsive custom provider. It validates exact decision and emotion, nonempty text, allowed financial figures, counter amount, transfer-status claims and contradictory acceptance wording. LLM validation is deliberately conservative; rejected wording falls back. No provider can change finances, ownership, emotions or decisions.

Fallbacks follow decision+emotion+behavior → decision+behavior → decision+emotion → decision, and always append the authoritative outcome. This makes lowballs, improvements, matching counters and regressing offers visibly different even offline. Stored messages identify TEMPLATE versus LLM correctly. Logs contain only provider, model, latency and fallbackUsed. API keys, Authorization headers, prompts and hidden prices are never logged.

Run the mocked success/failure suite with backend/tests/groq-dialogue.test.ts. The explicitly invoked live smoke test uses synthetic context only:

```powershell
node --env-file=backend/.env --import ./backend/node_modules/tsx/dist/loader.mjs backend/scripts/test-groq-dialogue.ts
```

## Storage and testing

New normalized tables: `manager_transfer_rules`, `manager_player_negotiation_profiles`, `manager_negotiation_sessions`, `manager_free_agent_offers`, `manager_negotiation_messages`. Existing teams, players, transfer ledger and notification tables remain in use. There is one session per tournament/team/player; reopening reuses it and preserves history.

`backend/tests/negotiation.test.ts` covers deterministic profiles, hard minimum/privacy, cooldowns, budget/permission checks, rival offers, window pause/resume, signing/competing-session closure and dialogue fallback. The real Postgres harness covers simultaneous confirmations and recovery on a fresh connection. The browser harness covers filters, offers, host rules and preserved fixture/trade UI. Frontend pagination currently limits rendered cards from the authoritative snapshot; it does not fetch paginated database pages.
