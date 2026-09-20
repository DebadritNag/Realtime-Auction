# Fastify Integration Guide

## ID Mapping

Every Fastify in-memory concept maps to a Supabase database entity:

| Fastify concept | Database table | Column |
|----------------|----------------|--------|
| `roomId` | `auction_rooms` | `id` |
| `teamId` | `room_members` | `id` |
| `userId` | `auth.users` / `profiles` | `id` |
| `auctionPoolId` / `poolItemId` | `auction_pool` | `id` |
| `playerId` | `football_players` | `id` |
| `potId` | `auction_pots` | `id` |
| `bidId` | `auction_bids` | `id` |
| `purchaseId` | `player_purchases` | `id` |
| price / bid amount | any `*_units` column | BIGINT half-crore integer |

**Key rule:** `teamId` in Fastify = `room_members.id`, **not** `user_id`. A user can theoretically join multiple rooms as different teams, each with its own `room_members.id`.

---

## Supabase Client Setup (Fastify)

```typescript
// src/repositories/supabase-client.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../supabase/types/database.types'

// service_role client — bypasses RLS — use only in trusted server code
export const db = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```

For operations requiring true ACID transactions (like `persist_sale`), use the direct `DATABASE_URL` with `pg` or `postgres.js`:

```typescript
// src/repositories/pg-pool.ts
import postgres from 'postgres'

export const sql = postgres(process.env.DATABASE_URL!)
// Or use node-postgres Pool for compatibility with existing code
```

---

## JWT Validation on WebSocket Connect

```typescript
import { createClient } from '@supabase/supabase-js'

// Validate incoming token and extract userId
async function validateSupabaseJWT(token: string): Promise<string> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Invalid token')
  return user.id  // = profiles.id = auth.users.id
}

// In your WebSocket upgrade handler:
fastify.get('/ws', { websocket: true }, async (socket, req) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token) { socket.close(1008, 'Missing token'); return }

  const userId = await validateSupabaseJWT(token)
  // Now look up room membership for this userId
})
```

---

## Room Creation

When a host creates a room via Fastify REST API:

```typescript
// 1. Insert room
const { data: room } = await db
  .from('auction_rooms')
  .insert({
    code: generateRoomCode(),       // 4–8 char alphanumeric
    host_user_id: userId,
    name: payload.name,
    number_of_teams: payload.numberOfTeams,
    starting_budget_units: payload.startingBudgetUnits,
    maximum_squad_size: payload.maxSquadSize,
    minimum_squad_size: payload.minSquadSize,
    player_timer_seconds: payload.timerSeconds,
    anti_sniping_enabled: payload.antiSniping,
    // ...other settings
  })
  .select()
  .single()

// 2. Insert host as room member
const { data: member } = await db
  .from('room_members')
  .insert({
    room_id: room.id,
    user_id: userId,
    team_name: payload.teamName,
    role: 'HOST',
    starting_budget_units: payload.startingBudgetUnits,
    remaining_budget_units: payload.startingBudgetUnits,
  })
  .select()
  .single()

// member.id is the HOST's teamId
```

---

## Player Joins Room

```typescript
const { data: member } = await db
  .from('room_members')
  .insert({
    room_id: roomId,
    user_id: userId,
    team_name: payload.teamName,
    role: 'PLAYER',
    starting_budget_units: room.starting_budget_units,
    remaining_budget_units: room.starting_budget_units,
  })
  .select()
  .single()

// member.id = teamId for this player in this room
```

---

## Persisting a Bid

Bids are written by Fastify after the auction engine accepts them:

```typescript
await db.from('auction_bids').insert({
  room_id: roomId,
  auction_pool_id: poolItemId,
  player_id: playerId,
  user_id: userId,
  team_id: teamId,          // room_members.id
  amount_units: bidUnits,
  client_request_id: clientRequestId ?? null,  // for idempotency
  sequence: currentSequence,
})
```

If `client_request_id` is provided, a retry with the same ID is a no-op (partial unique index).

---

## Atomic Sale Commit — `persist_sale()` RPC

When Fastify determines a player is SOLD, call the RPC to atomically persist everything in one transaction:

```typescript
const { data, error } = await db.rpc('persist_sale', {
  p_room_id:      roomId,
  p_pool_item_id: poolItemId,
  p_player_id:    playerId,
  p_team_id:      winningTeamId,    // room_members.id
  p_user_id:      winningUserId,
  p_price_units:  finalPriceUnits,
  p_sequence:     eventSequence,
})

if (error) {
  // Handle: player already sold, insufficient budget, etc.
  logger.error('persist_sale failed', error)
  throw error
}
// data = { purchase_id, price_units, team_id, player_id }
```

`persist_sale()` atomically:
1. Validates pool item is not already SOLD
2. Validates team has sufficient budget
3. Inserts `player_purchases`
4. Updates `auction_pool` → SOLD with `final_price_units` and `winning_team_id`
5. Updates `room_members` → decrements `remaining_budget_units`, increments `spent_units` and `players_owned`
6. Upserts `auction_runtime_snapshots` with new sequence
7. Inserts `auction_events` with `PLAYER_SOLD` type

On failure (double-sell, insufficient budget), it raises an exception and rolls back entirely.

---

## Marking a Player Unsold

```typescript
await db.rpc('persist_unsold', {
  p_room_id:      roomId,
  p_pool_item_id: poolItemId,
  p_player_id:    playerId,
  p_sequence:     eventSequence,
})
```

---

## Updating Room Status

```typescript
await db.from('auction_rooms').update({
  status: 'RUNNING',
  started_at: new Date().toISOString(),
}).eq('id', roomId)
```

Valid transitions (enforced by Fastify logic, not DB triggers):
- `LOBBY → STARTING → RUNNING`
- `RUNNING → PAUSED → RUNNING`
- `RUNNING → COMPLETED`
- `COMPLETED → CLOSED`

---

## Writing the Runtime Snapshot (Crash Recovery)

Fastify writes snapshots after key state changes so the engine can recover:

```typescript
await db.from('auction_runtime_snapshots').upsert({
  room_id: roomId,
  active_pool_item_id: currentPoolItemId,
  current_bid_units: currentBid,
  highest_bidder_team_id: leadingTeamId,
  ends_at: timerEndsAt.toISOString(),
  remaining_time_ms: remainingMs,
  sequence: sequence,
  state: fullStateSnapshot,  // JSONB for complete engine state
})
```

On server restart, read this to resume:

```typescript
const { data: snap } = await db
  .from('auction_runtime_snapshots')
  .select('*')
  .eq('room_id', roomId)
  .single()
```

---

## Updating User Stats (Post-Auction)

```typescript
// After auction completes, update stats for all participants
for (const member of roomMembers) {
  const isWinner = member.id === winnerTeamId
  await db.from('user_stats').upsert({
    user_id: member.user_id,
    auctions_played: db.rpc('increment', { x: 1 }),  // or use raw SQL
    auctions_won: isWinner ? db.rpc('increment', ...) : undefined,
    players_purchased: member.players_owned,
    total_spend_units: member.spent_units,
    // etc.
  })
}
```

For a cleaner atomic update, use a direct SQL update:

```sql
UPDATE public.user_stats
SET
  auctions_played = auctions_played + 1,
  auctions_won = auctions_won + $is_winner::int,
  players_purchased = players_purchased + $players_purchased,
  total_spend_units = total_spend_units + $spent_units,
  highest_purchase_units = GREATEST(highest_purchase_units, $highest_purchase)
WHERE user_id = $user_id;
```

---

## Achievement Unlock (Idempotent)

```typescript
await db.from('user_achievements').upsert(
  {
    user_id: userId,
    achievement_id: achievementId,
    context: { room_id: roomId, amount_units: priceUnits },
  },
  { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
)
// Unique constraint prevents double-unlock
```

---

## Writing the Result Snapshot

```typescript
await db.from('auction_result_snapshots').upsert({
  room_id: roomId,
  summary: {
    teams: teamSummaries,
    playersSold: soldCount,
    playersUnsold: unsoldCount,
    totalSpendUnits: totalSpend,
    highestSaleUnits: highestSale,
    winner: { teamId: winnerTeamId, squadValueUnits: winnerValue },
    generatedBy: 'fastify-v1',
  },
  generated_at: new Date().toISOString(),
})
```

---

## Querying Room State (Frontend REST Queries)

The frontend queries Supabase directly for non-live data (room lobby, player catalogue, results):

```typescript
// Load room + members
const { data } = await supabase
  .from('room_team_summary_v')
  .select('*')
  .eq('room_id', roomId)

// Load auction pool for a room
const { data: pool } = await supabase
  .from('auction_pool')
  .select('*, football_players(*), auction_pots(name)')
  .eq('room_id', roomId)
  .order('queue_order')

// User's auction history
const { data: history } = await supabase
  .from('user_auction_history_v')
  .select('*')
  .eq('user_id', userId)
  .order('started_at', { ascending: false })
```

---

## Transaction Strategy Summary

| Operation | Strategy |
|-----------|---------|
| Player SOLD | `persist_sale()` RPC — single atomic PostgreSQL transaction |
| Player UNSOLD | `persist_unsold()` RPC |
| Bid insert | Single `auction_bids` insert with idempotency key |
| Room status change | Single `auction_rooms` update |
| Member join | Single `room_members` insert |
| Stats update | Separate UPDATE per user (post-auction, not time-critical) |
| Achievement unlock | Upsert with `ignoreDuplicates` |
| Result snapshot | Upsert `auction_result_snapshots` |
