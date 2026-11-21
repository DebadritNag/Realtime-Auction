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
| UPDATE_SETTINGS | {roomCode, settings: partialSettings, expectedSequence?}; host, lobby. `settings.playerPoolSource` (`DEFAULT`/`FC26`) and `settings.retention.enabled` are synchronized to every member through ROOM_STATE.settings. FC26 players add optional `fullName`, `potential`, `positions`, `draftPool`, `playerTag`, `sourceCategory`; pots are GK/CB/FB/MID/ATT. |
| START_RETENTION | {roomCode, expectedSequence?}; host, lobby, `retention.enabled`, phase NOT_STARTED, at least `minimumParticipants` teams. Freezes the team order (Team 1..N) and opens Team 1. Errors: RETENTION_NOT_ENABLED, RETENTION_ALREADY_STARTED, NOT_ENOUGH_PARTICIPANTS. |
| RETAIN_PLAYER | {roomCode, playerId, expectedSequence?}; the ACTIVE team's manager only. Adds an unconfirmed selection (draft); nothing is charged until FINALIZE_RETENTIONS. Fixed 15 Cr (30 units), max 3 per team. Errors: NOT_ACTIVE_TEAM (403), TURN_ALREADY_COMPLETED, RETENTION_NOT_STARTED, RETENTION_CLOSED, RETENTION_PLAYER_NOT_FOUND (404), ALREADY_SELECTED, PLAYER_RESERVED, PLAYER_ALREADY_RETAINED, RETENTION_LIMIT_REACHED, SQUAD_FULL, INSUFFICIENT_PURSE. |
| REMOVE_RETENTION_PLAYER | {roomCode, playerId, expectedSequence?}; active team only. Removes one of its own drafts (DRAFT_NOT_FOUND 404). |
| CONFIRM_RETENTION | {roomCode, expectedSequence?}; active team only. Locks 1..3 drafts as confirmed picks, completes the turn and advances to the next team (or ALL_TEAMS_COMPLETED). Zero drafts is rejected with USE_SKIP_RETENTION. |
| SKIP_RETENTION | {roomCode, expectedSequence?}; active team's manager, or the host on its behalf (absent manager). Discards drafts, records a SKIPPED turn and advances. |
| FINALIZE_RETENTIONS / RESET_RETENTIONS | {roomCode, expectedSequence?}; host, lobby. Finalize needs phase ALL_TEAMS_COMPLETED (RETENTION_NOT_COMPLETE otherwise), then adds every confirmed pick to its team squad (acquisitionType RETENTION, 15 Cr) and deducts the purses in one commit. Reset reverses a finalized state, clears drafts, picks and turns and returns to NOT_STARTED. |

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
- PLAYER_RETAINED: pickId, teamId, playerId, priceCr, retainedCount, remainingBudgetCr (followed by TEAM_UPDATED and BUDGET_UPDATED).
- RETENTION_STARTED: order [{teamId, name, order}], activeTeamId. RETENTION_TURN_STARTED: teamId, teamName, order (sent for Team 1 and after every completed turn).
- RETENTION_PLAYER_RESERVED / RETENTION_PLAYER_RELEASED: playerId only. Other teams see the player as unavailable, never which team selected it.
- RETENTION_TEAM_CONFIRMED (one per completed turn, retained or skipped): eventId (unique per turn; clients dedupe on it), kind RETAINED|SKIPPED, teamId, teamName, teamOrder, totalTeams, players [{playerId, name, fullName, ovr, position, positions, club, nationality, imageUrl, playerTag, draftPool, priceCr}], spentCr, remainingPurseCr, nextTeamId, nextTeamName, nextTeamOrder, allCompleted, at. Followed by TEAM_UPDATED, BUDGET_UPDATED and RETENTION_TURN_STARTED or RETENTION_ALL_COMPLETED. Only confirmed data is sent.
- RETENTION_ALL_COMPLETED: eventId, at, teams [{teamId, name, order, retainedCount, spentCr, remainingPurseCr}].
- RETENTION_FINALIZED: totalRetained, totalSpentCr, finalizedAt (followed by TEAM_UPDATED and BUDGET_UPDATED per team). RETENTION_RESET: removed or reason; sent on host reset and when the lobby is closed.
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

## Unanimous participant skip voting

Client commands use the existing authenticated socket and request envelope:

```json
{"type":"VOTE_SKIP_PLAYER","requestId":"unique-id","payload":{"roomCode":"ABC234","playerId":"player-id","activationId":"server-activation-uuid"}}
```

`REMOVE_SKIP_VOTE` uses the same payload. `activationId` comes from ROOM_STATE and distinguishes repeat/recall appearances of the same player. Never send a trusted voter identity. Membership, host exclusion, RUNNING state, biddingOpen, activation identity and server expiry are checked under the bidding/timer mutation lock.

Eligible voters are all current non-host team owners, regardless of connection presence. Zero voters never produces unanimity. Existing room policy prohibits leaving/kicking after the lobby; a disconnect or Exit-to-lobby keeps membership and threshold intact. No new live membership-removal mechanism is introduced.

Each member has one vote. Duplicate clicks with a new requestId return ALREADY_VOTED; an accepted request retried with the same requestId is acknowledged idempotently. Removing a missing vote returns NO_SKIP_VOTE. Other errors include HOST_CANNOT_VOTE, NOT_ROOM_MEMBER, AUCTION_PAUSED, AUCTION_NOT_RUNNING, NO_ACTIVE_PLAYER, STALE_STATE, TIMER_EXPIRED and BIDS_EXIST.

`SKIP_VOTE_UPDATED` broadcasts `{playerId,activationId,votes,required,reason}` where reason is VOTE_CAST, VOTE_REMOVED or BID_ACCEPTED. Each mutation is followed by personalized ROOM_STATE containing `activationId` and `skipVote:{votes,required,hasCurrentUserVoted}`. Clients display the snapshot rather than incrementing local counters. No voter ID list is exposed in the vote event.

Every accepted bid clears existing votes and broadcasts BID_ACCEPTED reset feedback. Invalid bids do not clear votes. Once any accepted bidder exists, new skip votes are disallowed: neither participants nor the host's existing Mark Unsold can discard that accepted bid. Normal bidding continues while votes are incomplete.

At unanimity the server reuses its unsold resolution, with PLAYER_UNSOLD `{playerId,reason:"UNANIMOUS_SKIP"}`. The player is recall-eligible, budgets are untouched, and the normal random selector runs after the configured transition delay (including when ordinary autoAdvance is disabled). If no waiting players remain, the auction remains between rounds for host recall/end. Persistence succeeds before events publish. The active vote array is discarded with the resolved player; new activations start empty. Pausing preserves votes but disallows cast/remove commands until resume.

Votes persist in the existing active-room snapshot as optional `skipVoterUserIds`; older snapshots default to no votes. `unsoldReason` on the player and an appended playerHistory entry preserve UNANIMOUS_SKIP. Recall preserves history; the next activation clears the current outcome reason. No database tables are added.

## Player retention (pre-auction)
## Player retention (pre-auction, sequential)
Lobby sub-phase, not a new room status. Phases: NOT_STARTED, TEAM_SELECTING, ALL_TEAMS_COMPLETED, FINALIZED (`OFF` when disabled). The server owns the order and the active team; commands from other teams are rejected. `ROOM_STATE.retention` = {enabled, config:{priceCr:15, maxPerTeam:3, minPerTeam:0}, phase, order:[{teamId,name,order,turnStatus PENDING|ACTIVE|COMPLETED|SKIPPED}], activeTeamId, activeTeamName, progress:{completed,total}, canAct, canSkipForActive, picks:[confirmed picks with teamName, order, confirmedAt, acquisitionType, player], turns:[announcement payloads], lastCompleted, completion, reservedPlayerIds (anonymous ids of all unconfirmed drafts), ownDraft:{players, spentCr, remainingPurseCr} (only the draft owner receives its contents), teams:[{teamId, retainedCount, remainingSlots, spentCr, remainingPurseCr, turnStatus}], totals, finalizedAt}. A reconnecting client (REJOIN_ROOM / REQUEST_STATE) receives the same state and dedupes announcements by `eventId`. Until finalize, confirmed spend is subtracted from the public team fields (`spentCr`, `remainingBudgetCr`); `team.playerIds`, `players` and `soldPlayers` change only at finalize. `soldPlayers` entries carry `acquisitionType` and `isRetained`; GET /api/rooms/:code/teams/:teamId players carry `acquisitionType`, `isRetained`, `acquiredByTeamId`, `acquisitionPriceCr`. `START_AUCTION` fails with RETENTION_NOT_FINALIZED (409) unless the phase is FINALIZED. Once started, join, leave and kick fail with RETENTION_IN_PROGRESS until the host resets; `startingBudgetCr`, `playerPoolSource` and `retention.enabled` are locked (RETENTION_LOCKED, 409). REST: `GET /api/rooms/:code/retention/players?search&group&offset&limit<=100` (members only; groups ALL/GK/CB/FB/CM/CDM/CMID/CAM/WM/ST/W, where CM = CDM+CM+CAM and CMID = CM only; confirmed picks and other teams' reservations are excluded; the viewer's own drafts are flagged `selected`).