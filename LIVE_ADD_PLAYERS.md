# Adding players to a live auction

The host can import more players while an auction is RUNNING or PAUSED. The operation only appends. It does not rebuild the pool, reorder players, or touch the live lot, bids, timer, purses, squads, retention or history.

## How selection works with additions

The engine has no flat queue. Each next player is drawn at random from the waiting players of a random pot (GK/DEF/MID/ATT for the default pool, GK/CB/FB/MID/ATT for FC26). Additions use a tail queue instead:

- New players are added to the room as WAITING with poolMeta and their ids are appended to oom.addedQueue in import order.
- The ordinary random draw only considers waiting players that are not in ddedQueue, so the odds for existing players do not change.
- When no ordinary waiting player is left, the next released addition is played in import order.

## Categories

At import time the pot of each new player is classified once against the room as it was before the import.

- ACTIVE: ordinary waiting players of that pot remain, the live lot is of that pot, or a released addition of that pot is queued. The player gets elease: FOLLOW and plays in the tail automatically.
- COMPLETED or NOT_IN_AUCTION: nothing of that pot remains. The player gets elease: HELD. It stays WAITING but is never selected and the auction never moves back to that category.

The host introduces held players with the RELEASE_POOL_ADDITIONS command (all, or a chosen list). They then play in the tail, in import order. START_RECALL keeps working while players are held. END_AUCTION skips held and queued players like any other waiting player.

## Eligibility

Identity is player_id. Per record, in this order: invalid (rejected); repeated in the file; retained; currently live; sold; already unsold; already in the pool (skipped); otherwise eligible. Existing players are never modified. Prices are computed on the server (FC26 rooms: Underdog 1 Cr, overall at or above the room threshold 5 Cr, else 3 Cr; default rooms: the default tier ladder), never taken from the file.

## CSV columns

FC26 schema (detected by a player_positions column): required player_id, player_positions, overall and short_name or long_name. Default schema: required player_id, name, overall and uction_group (GK/DEF/MID/ATT) or position. A row is Underdog when draft_pool is UNDERDOG or underdog_tag is set. See WEBSOCKET_PROTOCOL.md for the routes and payloads.

## Safety

- The commit runs inside RoomManager.mutate: per-room lock, latest committed state, optimistic sequence check. A concurrent bid cannot be overwritten.
- A repeated atchId is idempotent. Two commits of the same file add each player once.
- A commit that adds nothing writes nothing.
- A pool-only commit does not re-arm the lot timer.
- State lives in the existing jsonb snapshot (ddedQueue, poolImports, AuctionPlayer.poolMeta). No migration is needed.
- Limits: 1,500,000 characters, 1000 rows, 2 MB request body, 10 requests per minute. The file name is only a label.
