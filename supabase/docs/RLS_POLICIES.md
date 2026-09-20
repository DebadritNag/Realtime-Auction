# Row Level Security Policies

## Access Model Summary

| Actor | Key | RLS bypass? |
|-------|-----|-------------|
| Unauthenticated browser | anon key | No — all tables locked |
| Authenticated user (frontend) | anon key + JWT | No — limited read-only access |
| Fastify backend | service_role key | **Yes — full access** |

The service_role key bypasses RLS entirely. **Never expose it to the frontend.**

---

## Policy Table

### `profiles`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `profiles_select_public` | authenticated | SELECT | `true` — any authenticated user can read any profile |
| `profiles_select_anon` | anon | SELECT | `false` — anonymous users blocked |
| `profiles_update_own` | authenticated | UPDATE | `auth.uid() = id` |
| `profiles_insert_own` | authenticated | INSERT | `auth.uid() = id` |

Notes:
- Frontend cannot delete profiles
- Username uniqueness is enforced by DB constraint, not RLS
- Fastify uses service_role for any programmatic profile updates

---

### `user_stats`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `user_stats_select_own` | authenticated | SELECT | `auth.uid() = user_id` |

Notes:
- No INSERT/UPDATE/DELETE for frontend users
- Only Fastify (service_role) writes stats after auction events
- Prevents users from inflating their own stats

---

### `auction_rooms`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `rooms_select_member` | authenticated | SELECT | User is a room_member OR room is in LOBBY status |
| `rooms_insert_own` | authenticated | INSERT | `host_user_id = auth.uid()` |

Notes:
- LOBBY rooms are visible to all authenticated users (needed for join-by-code discovery)
- Users cannot UPDATE or DELETE rooms — Fastify handles all status transitions
- Room status changes (`STARTING → RUNNING → COMPLETED`) only happen via Fastify + service_role

---

### `room_members`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `members_select_room_participants` | authenticated | SELECT | User has any row in the same `room_id` |
| `members_insert_self` | authenticated | INSERT | `user_id = auth.uid()` |

Notes:
- Frontend can insert own membership row (joining a room)
- Cannot UPDATE: budget, spent, remaining, players_owned, role, or status — Fastify owns these
- The subquery in SELECT is intentional: it lets users see all members of a room they belong to

---

### `football_players`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `players_select_all` | authenticated | SELECT | `active = true` |

Notes:
- Read-only for all authenticated users — they need to browse available players
- Inactive players hidden from frontend

---

### `auction_pots`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `pots_select_room_member` | authenticated | SELECT | User is in `room_id` |

---

### `auction_pool`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `pool_select_room_member` | authenticated | SELECT | User is in `room_id` |

Notes:
- Frontend reads pool to display the player queue and auction progress
- **No INSERT/UPDATE/DELETE** — pool is managed by Fastify

---

### `auction_runtime_snapshots`

**No policies.** RLS enabled with zero grants.

Only `service_role` (which bypasses RLS) can access this table. Frontend clients receive a permission denied error if they attempt any query.

This is intentional — the snapshot table is for Fastify crash recovery only and must never be a client-facing realtime source.

---

### `auction_bids`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `bids_select_room_member` | authenticated | SELECT | User is in `room_id` |

Notes:
- **Frontend cannot INSERT bids.** All bids are written by Fastify after validating the bid in the live engine.
- Clients may read bid history for result pages and during-auction displays
- Bid decision (accept/reject/increment) is Fastify's responsibility

---

### `player_purchases`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `purchases_select_room_member` | authenticated | SELECT | User is in `room_id` |

Notes:
- **Frontend cannot INSERT purchases.** Only Fastify via `persist_sale()` RPC.
- Frontend reads purchases to display squad contents and auction results

---

### `auction_events`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `events_select_room_member` | authenticated | SELECT | User is in `room_id` |

Notes:
- Written by Fastify only
- Frontend may read for history/audit trail display

---

### `achievements`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `achievements_select_all` | authenticated | SELECT | `active = true` |

---

### `user_achievements`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `user_achievements_select_any` | authenticated | SELECT | `true` |

Notes:
- All authenticated users can see anyone's achievements (public leaderboard/profile)
- Fastify writes achievement unlocks idempotently via service_role
- The unique constraint `(user_id, achievement_id)` prevents double-unlock at DB level

---

### `auction_result_snapshots`

| Policy | Role | Operation | Condition |
|--------|------|-----------|-----------|
| `result_snapshots_select_member` | authenticated | SELECT | User is in `room_id` |

---

## Critical Security Properties

### Budget protection
Users **cannot** directly modify:
- `room_members.remaining_budget_units`
- `room_members.spent_units`
- `room_members.players_owned`

These are read-only from the frontend. Fastify updates them via `persist_sale()` after each verified sale.

### Bid injection prevention
The `auction_bids` table has no INSERT policy for `authenticated`. A user attempting to directly POST a bid to the Supabase REST API (`/rest/v1/auction_bids`) will receive `HTTP 403`. All bids must go through Fastify WebSocket → validated by auction engine → written by service_role.

### Purchase injection prevention
Same as bids — `player_purchases` has no INSERT policy for `authenticated`. Only `persist_sale()` running as service_role (SECURITY DEFINER, REVOKE'd from authenticated/anon) can write purchases.

### Pool manipulation prevention
`auction_pool` status (`WAITING → ACTIVE → SOLD → UNSOLD`) cannot be changed by the frontend. Only Fastify via service_role may update pool items.

---

## Supabase Realtime Publication

**None of the auction tables are added to the realtime publication.**

The app uses Fastify WebSockets for all live sync. Tables are accessible only via REST queries (for history/loading), not realtime subscriptions.

Do not add the following tables to `supabase_realtime` publication:
- `auction_rooms`
- `auction_pool`
- `auction_bids`
- `room_members`
- `auction_runtime_snapshots`
- `player_purchases`
- `auction_events`
