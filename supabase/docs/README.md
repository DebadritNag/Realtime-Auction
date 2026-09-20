# Supabase Layer — Realtime Football Auction

This directory contains the complete Supabase persistence and authentication layer for the multiplayer football auction application.

## Architecture Principle

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                       │
│  • Supabase Auth (sign up / sign in / session)            │
│  • Read-only queries (players, room state, history)       │
│  • Supabase anon key only                                 │
└───────────────────────┬──────────────────────────────────┘
                        │  Auth JWT
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Fastify WebSocket Server                                 │
│  • Live auction authority                                 │
│  • Validates Supabase JWT on WS connect                   │
│  • Writes bids, purchases, events via service_role        │
│  • Calls persist_sale() RPC for atomic sale commits       │
└───────────────────────┬──────────────────────────────────┘
                        │  service_role (bypasses RLS)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                      │
│  • Auth + profiles                                        │
│  • Rooms, members, pool, bids, purchases                  │
│  • Durable audit log (auction_events)                     │
│  • Recovery snapshots                                     │
│  • Achievements, results, history                         │
└──────────────────────────────────────────────────────────┘
```

**Supabase Realtime is NOT used.** All live sync goes through Fastify WebSockets.

## Directory Structure

```
supabase/
├── migrations/          # Applied to hosted project via MCP / CLI
├── seeds/               # Reference data (players CSV import scripts)
├── functions/           # Edge Functions (if needed in future)
├── types/
│   └── database.types.ts  # Auto-generated TypeScript types
└── docs/
    ├── README.md          ← you are here
    ├── DATABASE_SCHEMA.md
    ├── AUTH.md
    ├── RLS_POLICIES.md
    ├── FASTIFY_INTEGRATION.md
    ├── MONEY_MODEL.md
    └── MIGRATIONS.md
```

## Quick Start

### Apply migrations to a new project

```bash
# Link CLI to your project
supabase link --project-ref <project_ref>

# Pull existing migration history
supabase migration fetch --yes

# Apply all pending migrations
supabase db push
```

### Regenerate TypeScript types

```bash
supabase gen types --linked > supabase/types/database.types.ts
```

### Environment variables

**Frontend (`frontend/.env.local`)**
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

**Backend (`backend/.env`)**
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
# OR direct connection for transactions:
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
```

## Hosted Project

| Item | Value |
|---|---|
| Project ref | `dvhzbkehgnkhernboigi` |
| Region | `ap-northeast-2` |
| Database version | PostgreSQL 17 |

## Key Design Decisions

- **No Supabase Realtime** — auction state flows through Fastify WebSockets only
- **Money as BIGINT** — half-crore integer units, never floats (see `MONEY_MODEL.md`)
- **Fastify is the auction authority** — no triggers decide bids, timers, or winners
- **`persist_sale()` RPC** — atomic sale commit callable only by service_role
- **CITEXT usernames** — case-insensitive uniqueness without application-level normalization
- **`team_id` = `room_members.id`** — Fastify's teamId maps directly to this PK
