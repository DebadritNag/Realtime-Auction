# Database Schema

## ER Diagram

```mermaid
erDiagram
    auth_users {
        uuid id PK
        text email
    }

    profiles {
        uuid id PK "FK → auth.users"
        citext username UK
        text display_name
        text avatar_url
        text default_team_name
        text default_team_logo_url
        text bio
        timestamptz created_at
        timestamptz updated_at
    }

    user_stats {
        uuid user_id PK "FK → profiles"
        int auctions_played
        int auctions_won
        int players_purchased
        bigint total_spend_units
        bigint highest_purchase_units
        int rooms_hosted
    }

    auction_rooms {
        uuid id PK
        text code UK
        uuid host_user_id "FK → profiles"
        text name
        text status
        int number_of_teams
        bigint starting_budget_units
        int minimum_squad_size
        int maximum_squad_size
        int player_timer_seconds
        bool anti_sniping_enabled
        timestamptz started_at
        timestamptz completed_at
    }

    room_members {
        uuid id PK "= teamId in Fastify"
        uuid room_id "FK → auction_rooms"
        uuid user_id "FK → profiles"
        text team_name
        text role
        text status
        bigint starting_budget_units
        bigint spent_units
        bigint remaining_budget_units
        int players_owned
    }

    football_players {
        uuid id PK
        text external_id UK
        text name
        int overall
        text position
        text nationality
        text club
        bigint base_price_units
        bool active
    }

    auction_pots {
        uuid id PK
        uuid room_id "FK → auction_rooms"
        text name
        int sort_order
    }

    auction_pool {
        uuid id PK
        uuid room_id "FK → auction_rooms"
        uuid player_id "FK → football_players"
        uuid pot_id "FK → auction_pots"
        int queue_order
        text status
        bigint base_price_units
        bigint final_price_units
        uuid winning_team_id "FK → room_members"
    }

    auction_runtime_snapshots {
        uuid room_id PK "FK → auction_rooms"
        uuid active_pool_item_id "FK → auction_pool"
        bigint current_bid_units
        uuid highest_bidder_team_id "FK → room_members"
        bigint sequence
        jsonb state
    }

    auction_bids {
        uuid id PK
        uuid room_id "FK → auction_rooms"
        uuid auction_pool_id "FK → auction_pool"
        uuid player_id "FK → football_players"
        uuid user_id "FK → profiles"
        uuid team_id "FK → room_members"
        bigint amount_units
        uuid client_request_id
        bigint sequence
    }

    player_purchases {
        uuid id PK
        uuid room_id "FK → auction_rooms"
        uuid auction_pool_id UK "FK → auction_pool"
        uuid player_id "FK → football_players"
        uuid team_id "FK → room_members"
        uuid user_id "FK → profiles"
        bigint price_units
        timestamptz purchased_at
    }

    auction_events {
        bigint id PK
        uuid room_id "FK → auction_rooms"
        bigint sequence UK
        text event_type
        uuid user_id "FK → profiles"
        uuid team_id "FK → room_members"
        uuid player_id "FK → football_players"
        jsonb payload
    }

    achievements {
        uuid id PK
        text code UK
        text name
        text description
        text category
        bool active
    }

    user_achievements {
        uuid id PK
        uuid user_id UK "FK → profiles"
        uuid achievement_id UK "FK → achievements"
        timestamptz unlocked_at
        jsonb context
    }

    auction_result_snapshots {
        uuid room_id PK "FK → auction_rooms"
        jsonb summary
        timestamptz generated_at
    }

    auth_users ||--|| profiles : "triggers create"
    profiles ||--|| user_stats : "auto-created"
    profiles ||--o{ auction_rooms : "hosts"
    profiles ||--o{ room_members : "joins as"
    auction_rooms ||--o{ room_members : "has"
    auction_rooms ||--o{ auction_pots : "has"
    auction_rooms ||--o{ auction_pool : "has"
    auction_rooms ||--|| auction_runtime_snapshots : "has"
    auction_rooms ||--o{ auction_bids : "has"
    auction_rooms ||--o{ player_purchases : "has"
    auction_rooms ||--o{ auction_events : "has"
    auction_rooms ||--|| auction_result_snapshots : "has"
    room_members ||--o{ auction_bids : "places"
    room_members ||--o{ player_purchases : "wins"
    football_players ||--o{ auction_pool : "enters"
    football_players ||--o{ auction_bids : "bid on"
    football_players ||--o{ player_purchases : "sold as"
    auction_pool ||--o{ auction_bids : "receives"
    auction_pool ||--|| player_purchases : "results in"
    profiles ||--o{ user_achievements : "earns"
    achievements ||--o{ user_achievements : "awarded via"
```

---

## Tables Reference

### `profiles`
One row per auth user. Auto-created by `_internal.handle_new_user()` trigger on `auth.users` INSERT.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | Mirrors `auth.users.id` |
| `username` | `CITEXT UNIQUE` | 3–30 chars, `[a-zA-Z0-9_]` only |
| `display_name` | `TEXT` | Optional display name |
| `avatar_url` | `TEXT` | |
| `default_team_name` | `TEXT` | Pre-fills room join form |
| `default_team_logo_url` | `TEXT` | |
| `bio` | `TEXT` | |

**Constraints:** `profiles_username_length` (3–30), `profiles_username_format` (alphanumeric + underscore), `profiles_username_unique`

---

### `user_stats`
Auto-created alongside profile. Updated by Fastify via service_role after auction events.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `UUID PK/FK` | → profiles |
| `auctions_played` | `INTEGER ≥ 0` | |
| `auctions_won` | `INTEGER ≥ 0` | |
| `players_purchased` | `INTEGER ≥ 0` | |
| `total_spend_units` | `BIGINT ≥ 0` | Half-crore units |
| `highest_purchase_units` | `BIGINT ≥ 0` | Single player max |
| `rooms_hosted` | `INTEGER ≥ 0` | |

---

### `auction_rooms`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `code` | `TEXT UNIQUE` | 4–12 chars, join code |
| `host_user_id` | `UUID FK` | → profiles, RESTRICT delete |
| `status` | `TEXT` | `LOBBY \| STARTING \| RUNNING \| PAUSED \| COMPLETED \| CLOSED` |
| `number_of_teams` | `INTEGER > 1` | |
| `starting_budget_units` | `BIGINT > 0` | Half-crore units |
| `maximum_squad_size` | `INTEGER ≥ minimum` | |
| `player_timer_seconds` | `INTEGER > 0` | |
| `anti_sniping_enabled` | `BOOLEAN` | |
| `started_at` | `TIMESTAMPTZ nullable` | Set by Fastify |
| `completed_at` | `TIMESTAMPTZ nullable` | Set by Fastify |

---

### `room_members`
**`id` = `teamId` in Fastify.** Each user can join a room once.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | Used as `teamId` in Fastify |
| `room_id` | `UUID FK` | CASCADE delete |
| `user_id` | `UUID FK` | RESTRICT delete |
| `role` | `TEXT` | `HOST \| PLAYER` |
| `status` | `TEXT` | `JOINED \| READY \| DISCONNECTED \| LEFT \| KICKED` |
| `starting_budget_units` | `BIGINT > 0` | Copied from room at join |
| `spent_units` | `BIGINT ≥ 0` | Updated by Fastify/persist_sale |
| `remaining_budget_units` | `BIGINT ≥ 0` | Updated by Fastify/persist_sale |
| `players_owned` | `INTEGER ≥ 0` | Updated by persist_sale |

**Unique indexes:** `(room_id, user_id)`, one HOST per room, team name unique per room (case-insensitive).

---

### `football_players`
Master catalogue. Seeded by admin import. Frontend reads; Fastify reads; nobody writes from client.

| Column | Type | Constraint |
|--------|------|------------|
| `overall` | `INTEGER` | 1–99 |
| `position` | `TEXT` | Enum: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST |
| `pace/shooting/passing/dribbling/defending/physical` | `INTEGER nullable` | 0–99 |
| `base_price_units` | `BIGINT ≥ 0` | Default 2 (= ₹1 Cr) |
| `preferred_foot` | `TEXT nullable` | Left, Right, Both |

---

### `auction_pots`
Room-scoped player groupings (Elite, Attackers, etc.). Fully custom.

---

### `auction_pool`
Players queued for a specific room's auction. One player per room.

| Column | Notes |
|--------|-------|
| `status` | `WAITING → ACTIVE → SOLD / UNSOLD / SKIPPED` |
| `winning_team_id` | → `room_members.id`; set by `persist_sale()` |
| `final_price_units` | Set by `persist_sale()` |

**Unique indexes:** `(room_id, player_id)`, one ACTIVE per room at a time.

---

### `auction_runtime_snapshots`
One row per room. Written by Fastify for crash recovery. **No client access.**

---

### `auction_bids`
Written by Fastify only. Idempotency via `(room_id, user_id, client_request_id)` partial unique index.

---

### `player_purchases`
Canonical ownership record. One per pool item — enforced by `UNIQUE(room_id, auction_pool_id)`. Written by `persist_sale()` only.

---

### `auction_events`
Durable audit log with room-scoped `sequence`. Written by Fastify.

Valid `event_type` values:
`ROOM_CREATED`, `TEAM_JOINED`, `TEAM_LEFT`, `TEAM_KICKED`, `AUCTION_STARTED`, `AUCTION_PAUSED`, `AUCTION_RESUMED`, `AUCTION_COMPLETED`, `PLAYER_STARTED`, `BID_ACCEPTED`, `PLAYER_SOLD`, `PLAYER_UNSOLD`, `PLAYER_SKIPPED`, `ROOM_CLOSED`

---

### `achievements` / `user_achievements`
Seeded achievement catalogue. Fastify inserts into `user_achievements` idempotently — the unique constraint `(user_id, achievement_id)` prevents duplicates.

---

### `auction_result_snapshots`
Immutable JSONB summary written by Fastify on auction completion. Enables fast history rendering.

---

## Views

| View | Purpose |
|------|---------|
| `room_team_summary_v` | Budget + purchase stats per team in a room |
| `room_results_v` | Aggregate stats per room (sold/unsold counts, totals) |
| `user_auction_history_v` | All auctions a user participated in |
| `player_sale_history_v` | Every player sale across all rooms |

All views use `security_invoker = true` — they respect the caller's RLS context.

---

## Foreign Key Delete Behavior

| Parent | Child | On Delete |
|--------|-------|-----------|
| `auth.users` | `profiles` | CASCADE — deletes profile when auth user removed |
| `profiles` | `user_stats` | CASCADE |
| `profiles` | `room_members` | RESTRICT — cannot delete profile while in a room |
| `profiles` | `auction_rooms` (host) | RESTRICT — cannot delete host profile |
| `auction_rooms` | `room_members` | CASCADE |
| `auction_rooms` | `auction_pots` | CASCADE |
| `auction_rooms` | `auction_pool` | CASCADE |
| `auction_rooms` | `auction_runtime_snapshots` | CASCADE |
| `auction_rooms` | `auction_bids` | CASCADE |
| `auction_rooms` | `player_purchases` | CASCADE |
| `auction_rooms` | `auction_events` | CASCADE |
| `auction_rooms` | `auction_result_snapshots` | CASCADE |
| `football_players` | `auction_pool` | RESTRICT — cannot delete a player in a pool |
| `football_players` | `auction_bids` | RESTRICT |
| `football_players` | `player_purchases` | RESTRICT |
| `auction_pool` | `auction_bids` | CASCADE |
| `auction_pool` | `player_purchases` | CASCADE |
| `room_members` | `auction_bids` | RESTRICT |
| `room_members` | `player_purchases` | RESTRICT |
| `auction_pool` winning_team_id | (FK) | SET NULL |
| `room_members` | `auction_runtime_snapshots` | SET NULL |
