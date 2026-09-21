# WebSocket protocol v1

Native WebSocket at `/ws?token=<URL-encoded-access-token>`. An Authorization Bearer header is also accepted for non-browser clients. Origin must exactly match an allowed frontend origin. Authentication occurs before upgrade.

## Envelopes

Client:

```json
{
  "type": "PLACE_BID",
  "requestId": "unique-client-generated-id",
  "payload": {
    "roomCode": "ABC234",
    "amountCr": 22,
    "playerId": "demo-1",
    "expectedSequence": 104
  }
}
```

roomCode is the room address in this version. requestId is optional but strongly recommended for all mutations. playerId and expectedSequence are optional stale-command guards on bids; expectedSequence is accepted by all host commands. userId/teamId/currentBid/remainingBudget supplied as actor fields are rejected.

Server:

```json
{
  "type": "BID_UPDATED",
  "roomId": "server-generated-uuid",
  "sequence": 105,
  "serverTime": 1780000000000,
  "payload": {
    "playerId": "demo-1",
    "amountCr": 22,
    "highestBidderTeamId": "team-uuid",
    "minimumNextBidCr": 24,
    "endsAt": 1780000005000,
    "bidCount": 7
  }
}
```

Times are epoch milliseconds. All exposed monetary values are Cr, not internal units. Socket-local events may omit roomId and use sequence=0. requestId is echoed on direct responses.

## Commands

| Type | Payload / behavior |
| --- | --- |
| JOIN_ROOM / REJOIN_ROOM | {roomCode}; subscribe existing REST-created membership; returns ROOM_STATE |
| REQUEST_STATE | {roomCode}; membership-checked complete snapshot; also subscribes |
| START_AUCTION | {roomCode, expectedSequence?}; host |
| PLACE_BID | {roomCode, amountCr, playerId?, expectedSequence?} |
| PAUSE_AUCTION / RESUME_AUCTION | {roomCode, expectedSequence?}; host |
| NEXT_PLAYER | {roomCode, expectedSequence?}; host, no active player |
| MARK_UNSOLD | {roomCode, expectedSequence?}; host, active player without bids |
| START_RECALL | {roomCode, expectedSequence?}; host, round exhausted |
| END_AUCTION | {roomCode, expectedSequence?}; host |
| KICK_MEMBER | {roomCode, targetTeamId, expectedSequence?}; host, lobby |
| UPDATE_SETTINGS | {roomCode, settings: partialSettings, expectedSequence?}; host, lobby |
| PING | {} or omitted payload; returns PONG |

Subscribe before auction mutations. A socket can subscribe to multiple rooms. REST creates/joins membership; WS JOIN_ROOM does not create a team.

## Events

- CONNECTED: connectionId, userId, heartbeatIntervalMs.
- ROOM_STATE: full personalized snapshot described below.
- ROOM_UPDATED: settings/recall/closure or persistence reconciliation.
- MEMBER_JOINED / MEMBER_LEFT: membership identifiers; reconstruct teams from the following snapshot.
- PRESENCE_UPDATED: connectedUsers; multi-socket presence is deduplicated by user.
- AUCTION_STARTED: start marker.
- PLAYER_STARTED: player, basePriceCr, currentBidCr, minimumNextBidCr, highestBidderTeamId=null, startedAt, endsAt.
- BID_UPDATED: playerId, amountCr, highestBidderTeamId, minimumNextBidCr, endsAt, bidCount.
- TIMER_EXTENDED: playerId, endsAt.
- PLAYER_SOLD: playerId, teamId, priceCr, remainingBudgetCr, teamPlayerCount. Resolve player/team details from ROOM_STATE.
- PLAYER_UNSOLD: playerId.
- TEAM_UPDATED: teamId; updated squad follows in ROOM_STATE.
- BUDGET_UPDATED: teamId, spentCr, remainingBudgetCr.
- AUCTION_PAUSED: remainingTimeMs.
- AUCTION_RESUMED: endsAt, or null between players.
- AUCTION_COMPLETED: completion marker; fetch results.
- COMMAND_ACK: {sequence, duplicate}, with requestId; sent to command sender only.
- BID_REJECTED / ERROR: {reason, message, minimumNextBidCr?}, with requestId when command validation succeeded.
- PONG: serverTime in the envelope.

Every committed mutation broadcasts its domain events followed by a fresh personalized ROOM_STATE to subscribed members. Presence is ephemeral and does not increment the durable sequence.

## Snapshot and reconciliation

ROOM_STATE payload contains room identity/name/creation time, roomId/code, settings, status, host, currentPlayer, activePotId, activePlayerId, currentBidCr, highestBidderTeamId, minimumNextBidCr, maximumPermittedBidCr, startedAt, endsAt, remainingTimeMs, biddingOpen, lastBidAt, bidCount, nextPlayerAt, serverTime, sequence, teams, currentUserTeam, connectedUsers, players, playerQueue, playerQueueSummary, soldPlayers and unsoldPlayers.

Teams include startingBudgetCr, spentCr, remainingBudgetCr, playerIds, playersOwned, maximumPermittedBidCr and minimumSquadMet. Internal receipts, tokens and activation IDs are not exposed.

One transaction may emit several events **with the same sequence**. Ignore events with sequence **less than** the latest applied version; do not discard all equal-sequence events. Treat ROOM_STATE as the authoritative UI replacement. If sequence jumps, REQUEST_STATE; no event replay is required. Do not use sequence=0 local errors/acks to replace room version. Duplicate ACK can refer to an older committed sequence and is followed by current ROOM_STATE.

Display remaining time using serverTime and endsAt with a measured clock offset. When paused display remainingTimeMs; do not use the old deadline. Timers are not ticked each second over the network.

On disconnect keep the team, reconnect with a valid token, then REJOIN_ROOM. If disconnected during a bid, retry the identical command/requestId after rejoining. Accepted mutation receipts are keyed by authenticated user + room + requestId, retained 5 minutes with a maximum of 2000 recent entries per room. Reusing an ID with a changed payload rejects with IDEMPOTENCY_CONFLICT. Rejected commands are not cached. After receipt expiry/eviction, never blindly retry: inspect fresh state first.

## Rejections and transport behavior

Auction/bid reasons include AUCTION_NOT_RUNNING, AUCTION_PAUSED, NO_ACTIVE_PLAYER, TIMER_EXPIRED, INVALID_INCREMENT, BID_TOO_LOW, INSUFFICIENT_BUDGET, SQUAD_RESERVE_REQUIRED, SQUAD_FULL, ALREADY_HIGHEST_BIDDER, NOT_ROOM_MEMBER, HOST_REQUIRED, INVALID_STATE, STALE_STATE, BIDS_EXIST, NO_WAITING_PLAYERS, NO_UNSOLD_PLAYERS, IDEMPOTENCY_CONFLICT and PERSISTENCE_UNAVAILABLE.

Malformed JSON, unknown commands or unexpected fields receive ERROR / INVALID_MESSAGE. Such invalid envelopes may have no echoed requestId. No bid rejection is broadcast to other users.

Heartbeat uses native ping/pong every 30 seconds, which browsers answer automatically. Optional application PING estimates clock skew. Close 4001 means authentication/heartbeat expiry; 1013 means overload/slow consumer. Reconnect with backoff and request state. Maximum inbound payload 16 KiB, 30 commands/user/second across sockets, 32 queued commands/socket, 1 MiB outbound backlog. Rejected attempts count toward the throttle but do not otherwise block the next valid bid.


## Selected unsold-player recall

Host command (RUNNING or PAUSED only):

```json
{"type":"RECALL_PLAYERS","requestId":"unique-retry-id","payload":{"roomCode":"ABC234","playerIds":["player-id"]}}
```

Accepts 1–2000 distinct IDs belonging to the room, all currently UNSOLD and not already in the legacy recall queue. Validation is atomic under the room mutation lock. Unknown IDs return PLAYER_NOT_FOUND; duplicate IDs return DUPLICATE_PLAYER_IDS; unavailable/queued players return PLAYER_NOT_RECALLABLE. Existing membership, HOST_REQUIRED and INVALID_STATE checks apply. Reusing an accepted requestId with the same command returns COMMAND_ACK with duplicate=true; retrying with a new ID after recall is rejected without mutation.

Transitions UNSOLD → WAITING. The existing random category/player selector later activates recalled players with their preserved base price and incremented round. No priority queue entry is added; the active player, timer, budgets and anti-streak counters remain unchanged. When running idle with autoAdvance enabled, the normal transition delay is scheduled. Paused rooms wait for resume or the host's next-player action.

Each selected player emits PLAYER_RECALLED with payload {playerId,status:"WAITING",round}. The hub then sends each member an authoritative ROOM_STATE at the same new sequence and acknowledges the command. Persistence succeeds before broadcasts. Optional playerHistory in the room snapshot appends PLAYER_UNSOLD and PLAYER_RECALLED audit entries; existing snapshots remain compatible. Historical bids/purchases are untouched. Older snapshots cannot retroactively recover previously unrecorded unsold events.

The legacy START_RECALL whole-round command remains supported. The new UI uses RECALL_PLAYERS only.
