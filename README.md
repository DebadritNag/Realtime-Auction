# ⚽ Realtime Football Auction & Manager Mode

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Web-blue?style=for-the-badge&logo=googlechrome&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-5.0-000000?style=for-the-badge&logo=fastify&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Tests-75%2B%20Passing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

**An authoritative real-time multiplayer football auction platform, interactive team builder, and post-auction multi-season tournament manager with intelligent AI transfer negotiations.**

[Features](#-key-features) • [Architecture](#-system-architecture) • [Tech Stack](#-technology-stack) • [Quick Start](#-quick-start--local-development) • [WebSocket Protocol](#-websocket-protocol--realtime-engine) • [Manager Mode](#-manager-mode--transfer-market) • [Deployment](#-production-deployment) • [Documentation](#-in-depth-documentation)

---

</div>

## 📌 Executive Summary

**Realtime Football Auction** transforms casual fantasy football into an authoritative, competitive esports league experience. The platform combines:

1. **Live High-Stakes Auction Arena**: Fastify-backed authoritative state machine with sub-50ms WebSocket bidding, dynamic anti-sniping timer extensions, mathematical budget validation, unanimous participant skip voting, and host-driven unsold player recall.
2. **Curated FC24 Player Database**: 760+ real footballers cataloged across tactical pots and positions with genuine stats, ratings, and market valuations.
3. **Seamless Manager Mode Transition**: Automatic one-click snapshot of completed auctions into durable multi-season leagues where remaining auction purse rolls over into transfer budgets.
4. **Tactical Squad & Lineup Studio**: Interactive pitch formation builder (4-3-3, 4-4-2, 3-5-2, etc.), captaincy assignment, bench management, and instant PDF roster export.
5. **AI Transfer Market & Negotiation Engine**: 357 external free agents, deterministic 10-archetype player personalities, Groq LLM dynamic agent dialogue, peer-to-peer buyouts, player sales, and a 54-card secret "Hero" mystery market.

---

## 🏛 System Architecture

The system decouples high-frequency ephemeral auction bidding from durable tournament persistence, ensuring zero latency degradation during live bids while maintaining transactional safety for post-auction tournament operations.

```
                              ┌─────────────────────────────────────────┐
                              │            Next.js 16 Client            │
                              │     React 19 • Tailwind v4 • Zustand     │
                              │            (Deployed on Vercel)         │
                              └───────┬─────────────────────────┬───────┘
                                      │                         │
                         HTTPS / REST │                         │ Persistent WSS
                         Auth Headers │                         │ Monotonic Events
                                      ▼                         ▼
                              ┌─────────────────────────────────────────┐
                              │          Fastify 5 Backend API          │
                              │     Authoritative Room State Machine    │
                              │     WebSocket Hub & Timer Scheduler     │
                              │    (Deployed on Railway / Render / VPS) │
                              └───────┬─────────────────────────┬───────┘
                                      │                         │
            ES256 JWKS & Session Sync │                         │ Direct PostgreSQL
            Row-Level Auth Validation │                         │ Transactional Locks
                                      ▼                         ▼
                              ┌─────────────────────────────────────────┐
                              │            Supabase Platform            │
                              │   • Supabase Auth (ES256 / JWKS)        │
                              │   • PostgreSQL 15 (Manager Mode Tables) │
                              │   • Row-Level Security & Stored RPCs    │
                              └─────────────────────────────────────────┘
                                      │
                                      ▼
                              ┌─────────────────────────────────────────┐
                              │        External Intelligence            │
                              │   • Groq Cloud API (Negotiation LLM)    │
                              │   • FC24 Verified Player Catalog        │
                              └─────────────────────────────────────────┘
```

### Architectural Principles

* **Authoritative Server**: The client is purely a projection of the server state. The Fastify backend owns the clock, enforces bidding increments, calculates budgets, and validates all transitions.
* **Monotonic Sequencing & Idempotency**: Every state change increments a monotonic room sequence. Mutation requests include client-generated UUIDs (`requestId`) cached by Fastify to prevent duplicate bids or double charges during network retries.
* **Dual-Algorithm JWT Security**: Authentication handles modern Supabase ES256/RS256 tokens dynamically verified via Supabase's `.well-known/jwks.json` endpoint, with fallback support for legacy HS256 secrets.
* **Zero Supabase Realtime Dependency**: Live bidding and tournament updates stream exclusively through custom high-performance WebSockets on the Fastify server, avoiding third-party latency or pricing caps.

---

## ✨ Key Features

### 1. ⚡ Live Auction Arena
* **Authoritative Clock & Timers**: Server-side countdown timers eliminate client clock-skew.
* **Anti-Sniping Protection**: Configurable threshold (default 3s) dynamically resets the countdown clock (to 5s) when late bids occur.
* **Squad Budget Reserve Protection**: Fastify enforces that remaining budget can always afford the minimum squad size at base price, completely preventing budget lockouts.
* **Unanimous Skip Voting**: Non-host participants can vote to skip unwanted players. When all non-host participants vote skip, the player is automatically marked unsold and the queue advances.
* **Host Player Recall**: Host can browse unsold players with real-time search, multi-select checkboxes, and re-inject them into the active auction pool.
* **AI Tactical Advisor**: In-auction recommendation panel computes squad balance, category scarcity, and suggested ceiling bids.
* **Live Feed & Overlays**: Real-time bid tickers, highest-bidder spotlights, and audio-visual cues for SOLD, UNSOLD, and SKIPPED states.

### 2. 📋 Post-Auction Manager Mode
* **Instant Snapshot Creation**: Completed auction rooms transition into permanent tournaments with one click, preserving original rosters, purchase ledgers, and team ownership.
* **Purse Rollover Calculation**: Opening transfer budget = Configurable Base Budget (default ₹100 Cr) + Remaining Unused Auction Purse.
* **Fixture Generation**: Automated single or double round-robin tournament schedules with odd-team bye handling.
* **Match Score Recording & Tie-Breakers**: Hosts record external FC24 match results and scorers. League standings compute automatically using Points (3/1/0) ➔ Goal Difference ➔ Goals Scored ➔ Stable Team ID.
* **Multi-Season Lifecycle**: Seasons can be completed, awarding champion league shields and finishing position prize pools (₹30 Cr down to ₹2 Cr) before initiating the next season.

### 3. 🛡 Squad Studio & Formation Tactics
* **Visual Pitch Formations**: Drag-and-drop or select positions in standard tactical setups: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, and 5-3-2.
* **Captain & Bench Selection**: Designate captaincy, organize substitutes, and monitor squad OVR and positional coverage.
* **Match Appearance & Goal Tracking**: Track individual player goals, appearances, and clean sheets across tournament fixtures.
* **Roster PDF Export**: Generate professional PDF squad rosters and team sheets with formatting powered by `jspdf` and `jspdf-autotable`.

### 4. 💼 Transfer Market & Deterministic AI Negotiation
* **357 External Free Agents**: Seeded with real FC24 footballers rated 79+ OVR with position-based baseline valuations.
* **10 Player Archetypes**: Free agents evaluate offers based on personality models (varying in money motivation, prestige, ego, playing time, patience, loyalty, and aggression).
* **Multi-Round Talks**: Fastify handles counter-offers, consideration pauses, walkaways, and cooldown timers (default 3m).
* **Groq LLM Dynamic Dialogue**: Offers are classified and fed to Groq (`openai/gpt-oss-20b`) to produce authentic, contextual dialogue from players and agents, with instant template fallback if offline.
* **Peer-to-Peer Buyouts**: Managers propose cash or cash-plus-player trades directly to rival managers with multi-round counter-offers.
* **Player Resale**: Release players back to the free agent pool for 40%–60% of their acquisition cost with a 24-hour re-sign cooldown for the selling club.
* **Secret Heroes Mystery Market**: 54 server-private Hero cards shuffled using Fisher-Yates; managers purchase anonymous slots that unmask immediately upon confirmed acquisition.

---

## 🛠 Technology Stack

### Frontend Application
| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 16.3.5 (App Router) | Server & Client Components, Route Handlers |
| **UI Library** | React 19.2.8 | Latest concurrency and hook features |
| **Styling** | Tailwind CSS v4 + PostCSS | Dark stadium theme, glassmorphism, responsive UI |
| **State Management** | Zustand 5.0 | Monotonic auction & manager mode stores |
| **Icons** | Lucide React | Clean, scalable icon system |
| **PDF Generation** | jsPDF 4.2 + AutoTable 5.0 | Squad sheets, team rosters, auction results |
| **Authentication** | `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.116 | Cookie-backed session management |
| **E2E Testing** | Playwright 1.63 | Automated UI and flow testing |

### Backend Service
| Layer | Technology | Details |
|---|---|---|
| **Runtime** | Node.js 22.x (ESM) | Modern JavaScript modules, native fetch & crypto |
| **Framework** | Fastify 5.0 | Ultra-fast HTTP & WebSocket server |
| **WebSockets** | `@fastify/websocket` 11.0 | Real-time bidirectional room communications |
| **Validation** | Zod 3.24 | Strict type validation on all incoming DTOs |
| **Authentication** | Jose 6.0 | ES256/RS256 JWKS verification & HS256 fallback |
| **Database Client** | Postgres.js 3.4.9 | Direct connection pooler for transactional SQL |
| **Rate Limiting** | `@fastify/rate-limit` 10.0 | DDoS and brute-force protection |
| **Testing** | Vitest 4.1.11 | Fast unit, integration, and mock suites |

### Database & External Services
| Component | Provider | Details |
|---|---|---|
| **Database** | PostgreSQL 15 (Supabase) | Atomic row locks, normalized tables, stored procedures |
| **Auth Provider** | Supabase Auth | Email/password sign-in, JWT token generation |
| **AI Dialogue** | Groq Cloud | LLM-powered transfer negotiation dialogue |
| **Player Data** | EA Sports FC24 | Verified career and player stats datasets |

---

## 📂 Project Directory Structure

```
Realtime-Auction/
├── backend/                             # Authoritative Fastify server
│   ├── data/                            # Verified CSV catalogs & external player seeds
│   │   ├── default-pool/                # 760-player curated FC24 auction pool
│   │   ├── manager-mode/                # 357 external free agent players (OVR 79+)
│   │   └── secret-heroes/               # 54 server-private mystery Hero players
│   ├── scripts/                         # Database verification and diagnostic tools
│   ├── src/
│   │   ├── app.ts                       # Fastify instance builder & middleware
│   │   ├── server.ts                    # Entrypoint, configuration, and port listener
│   │   ├── domain/                      # Domain entities, types, errors, state machine
│   │   ├── modules/
│   │   │   ├── auction/                 # Auction engine, timers, squad, skip voting
│   │   │   ├── auth-context/            # Supabase JWKS / JWT authentication service
│   │   │   ├── manager-mode/            # Tournaments, seasons, buyouts, negotiations
│   │   │   ├── players/                 # Player catalog service & query handlers
│   │   │   ├── recommendations/         # AI bidding advice & squad balance algorithm
│   │   │   └── rooms/                   # Room management, state serialization, lifecycle
│   │   ├── realtime/                    # WebSocket hub, protocol envelopes, broadcast
│   │   ├── repositories/                # Memory & PostgreSQL storage adapters
│   │   └── schemas/                     # Zod input validation schemas
│   └── tests/                           # 20 comprehensive Vitest test suites (75+ tests)
├── frontend/                            # Next.js 16 modern web client
│   ├── public/                          # Images, stadium assets, and audio cues
│   ├── src/
│   │   ├── app/                         # App router (auction, room, manager-mode, auth)
│   │   │   ├── auction/[roomCode]/      # Live interactive auction stage
│   │   │   ├── manager-mode/            # Tournament dashboard, squads, transfers, fixtures
│   │   │   ├── room/[roomCode]/         # Pre-auction lobby & team customization
│   │   │   └── create/                  # Auction room creator & settings config
│   │   ├── components/
│   │   │   ├── auction/                 # Bid controls, timer, skip vote, recall modal
│   │   │   ├── manager-mode/            # Pitch layout, fixture cards, buyout modal, tabs
│   │   │   └── ui/                      # Badges, modals, buttons, form controls
│   │   ├── stores/                      # Zustand state stores (auction & manager-mode)
│   │   ├── services/                    # REST client & persistent WebSocket manager
│   │   └── types/                       # Shared TypeScript definitions
│   └── tests/                           # Browser automation & component harnesses
├── scripts/                             # Python data processing & catalog generation
├── supabase/                            # Supabase migrations, seeds, and configurations
│   └── migrations/                      # PostgreSQL DDL migrations for Manager Mode
└── DEPLOYMENT.md                        # Complete production deployment handbook
```

---

## 🚀 Quick Start & Local Development

### Prerequisites
* **Node.js**: `22.x` or higher ([Download Node.js](https://nodejs.org/))
* **npm**: `10.x` or higher
* **Python**: `3.10+` (optional, for regenerating player catalogs)
* **Supabase Project**: Free tier project at [supabase.com](https://supabase.com)

---

### Step 1: Clone Repository

```bash
git clone https://github.com/DebadritNag/Realtime-Auction.git
cd Realtime-Auction
```

---

### Step 2: Configure & Start Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Update the key variables in `backend/.env`:
   ```dotenv
   PORT=4000
   HOST=127.0.0.1
   NODE_ENV=development
   FRONTEND_ORIGIN=http://localhost:3000

   # Supabase Configuration
   AUTH_MODE=jwt
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   DATABASE_URL=postgresql://postgres.your-project:password@aws-0-region.pooler.supabase.com:5432/postgres

   # Optional Groq Dialogue (falls back to templates if omitted)
   NEGOTIATION_DIALOGUE_PROVIDER=template
   # GROQ_API_KEY=gsk_...
   ```

4. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The backend will boot up at `http://127.0.0.1:4000` and report `[Fastify] Server listening at http://127.0.0.1:4000`.*

---

### Step 3: Configure & Start Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env.local` based on `.env.example`:
   ```bash
   cp .env.example .env.local
   ```

3. Configure `frontend/.env.local`:
   ```dotenv
   NEXT_PUBLIC_API_URL=http://localhost:4000
   NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_USE_MOCK_DATA=false
   ```

4. Run the frontend development server:
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) in your web browser to enter the application.*

---

## ⚙️ Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `PORT` | No | `4000` | Port for the Fastify HTTP & WebSocket server |
| `HOST` | No | `127.0.0.1` | Host address (`0.0.0.0` for production container) |
| `FRONTEND_ORIGIN` | Yes | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `STORAGE` | No | `file` | Auction persistence adapter (`file` or `memory`) |
| `AUTH_MODE` | Yes | `jwt` | Auth validator (`jwt` for Supabase or `development`) |
| `SUPABASE_URL` | Yes | - | Base URL of your Supabase project |
| `SUPABASE_ANON_KEY` | Yes | - | Public anon key for Supabase client calls |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Server-only service role key for admin verification |
| `DATABASE_URL` | Yes | - | Direct PostgreSQL connection string for Manager Mode |
| `NEGOTIATION_DIALOGUE_PROVIDER` | No | `template` | Dialogue generation (`template` or `groq`) |
| `GROQ_API_KEY` | No | - | API key for Groq Cloud LLM negotiations |
| `GROQ_MODEL` | No | `openai/gpt-oss-20b`| Groq model identifier |
| `MANAGER_RELEASE_RESIGN_COOLDOWN_HOURS` | No | `24` | Hours before a selling club can re-sign a player |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` | Fastify backend REST endpoint |
| `NEXT_PUBLIC_WS_URL` | Yes | `ws://localhost:4000/ws` | Fastify backend WebSocket endpoint (`wss://` in prod) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | - | Supabase project URL for authentication |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Yes | - | Supabase public anonymous key |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Yes | `false` | Must remain `false` for live authoritative operation |

---

## 📡 WebSocket Protocol & Realtime Engine

The auction and manager mode communicate over an authoritative, low-latency WebSocket connection at `/ws?token=<SUPABASE_ACCESS_TOKEN>`.

### Client Command Envelopes
Every command sent to the server adheres to a strict envelope structure:

```json
{
  "type": "PLACE_BID",
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "payload": {
    "roomCode": "ABC234",
    "amountCr": 24.5,
    "playerId": "p-10492",
    "expectedSequence": 42
  }
}
```

### Core Commands

| Command | Role | Description |
|---|:---:|---|
| `JOIN_ROOM` | Any | Subscribes socket to room updates and requests full `ROOM_STATE` |
| `PLACE_BID` | Bidder | Places a bid in Cr units (validated against squad minimums and budget) |
| `VOTE_SKIP_PLAYER` | Non-Host | Registers vote to skip the current active footballer |
| `REMOVE_SKIP_VOTE` | Non-Host | Withdraws an active skip vote |
| `START_AUCTION` | Host | Initiates the auction and starts the first player |
| `PAUSE_AUCTION` / `RESUME_AUCTION` | Host | Pauses or resumes the active countdown timer |
| `NEXT_PLAYER` | Host | Manually advances to the next player if auto-advance is disabled |
| `MARK_UNSOLD` | Host | Marks the current player unsold when no bids exist |
| `RECALL_PLAYERS` | Host | Re-queues specified unsold player IDs into the active pool |
| `END_AUCTION` | Host | Ends auction, seals results, and enables Manager Mode setup |
| `SUBSCRIBE_MANAGER_MODE` | Any | Subscribes socket to private tournament updates |

### Server Broadcast Events

| Event | Target | Description |
|---|:---:|---|
| `ROOM_STATE` | Subscriber | Full personalized room snapshot with teams, queues, budgets, and status |
| `BID_UPDATED` | Room | New highest bidder, new price, updated end timestamp, and bid count |
| `TIMER_EXTENDED` | Room | Anti-sniping trigger reset event with new deadline |
| `PLAYER_SOLD` | Room | Player transferred to winning team; debits budget and updates roster |
| `PLAYER_UNSOLD` | Room | Player passed without bids (or via unanimous skip) |
| `SKIP_VOTE_UPDATED` | Room | Updated skip voter count and threshold |
| `PLAYER_RECALLED` | Room | Emitted when host successfully re-injects players |
| `MANAGER_MODE_STATE` | Member | Authoritative personalized tournament snapshot |
| `NEGOTIATION_UPDATED`| Manager | Dynamic offer update with agent response and counter-offer |

---

## 🏆 Manager Mode & Transfer Market

Once an auction ends, the host launches **Manager Mode** at `/manager-mode/create/[auctionId]`.

```
     ┌──────────────────┐
     │ Completed Auction │
     └────────┬─────────┘
              │ 1-Click Snapshot
              ▼
     ┌──────────────────┐       Round-Robin
     │   Manager Mode   ├────────────────────────► [ Fixtures & Standings ]
     │    Tournament    │                          • Live Score Submission
     └────────┬─────────┘                          • Goalscorer Tracking
              │
              ├──────────────────────────────────► [ Squad & Pitch Editor ]
              │                                    • Formations (4-3-3, etc.)
              │                                    • Lineup PDF Generation
              │
              └──────────────────────────────────► [ Transfer Market ]
                                                   • 357 Free Agents (OVR 79+)
                                                   • Deterministic AI Talks
                                                   • Peer-to-Peer Buyouts
                                                   • 54 Secret Hero Mystery Cards
```

### Deterministic Player Personality Model
Each free agent generated has an immutable seed generating 10 personality traits:
* **Money Motivation**: Threshold of acceptable financial compensation.
* **Prestige & Ambition**: Preference for clubs with higher league standings and winning records.
* **Playing Time Sensitivity**: Reluctance to sign if the buyer already possesses high-OVR players in the same position.
* **Patience & Ego**: Determines how quickly the agent walks away if lowballed.
* **Decision Outcomes**: `ACCEPT`, `COUNTER`, `CONSIDER`, `WAIT`, `REJECT`, or `WALK_AWAY`.

### Secret Heroes (Anonymous Mystery Market)
* **54 Classic Icons & Heroes**: Stored privately on the server without initial stat reveals.
* **Fisher-Yates Shuffle**: All league managers see a synchronized, stable board of mystery slots.
* **Instant Unmasking**: Purchasing a slot for a flat fee (e.g., 90 units / ₹45 Cr) instantly reveals and binds the hero to the manager's roster.

---

## 🧪 Testing & Quality Assurance

The codebase includes comprehensive test suites across backend business logic, domain models, schemas, and frontend UI components.

### Running Backend Tests
From the `backend/` directory:

```bash
# Run all Vitest unit and integration suites
npm test

# Run tests with file watcher for active development
npx vitest

# Run TypeScript typechecker without emitting code
npm run typecheck

# Verify the bundled 357-player manager pool seed
node scripts/verify-manager-pool.mjs
```

### Backend Test Coverage Highlights
* **`auction.test.ts`**: Bidding mechanics, anti-sniping timers, budget limits, minimum squad size mathematical guarantees.
* **`skip-vote.test.ts`**: Unanimous skip voting thresholds, disconnected user calculations, bid-clear resets.
* **`recall.test.ts`**: Host unsold player recall, idempotency, search filter verification.
* **`negotiation.test.ts`**: 10-archetype evaluation engine, patience decay, counter-offer escalation limits.
* **`secret-heroes.test.ts`**: Fisher-Yates slot generation, concurrency protection, single-hero team limits.
* **`seasons.test.ts`**: Multi-season tournament lifecycle, champion shields, and rank-based prize distributions.

### Running Frontend Headless UI Tests
From the `frontend/` directory:

```bash
# Test Manager Mode UI interactions
node tests/manager-mode-ui.mjs

# Test Unsold Player Recall modal
node tests/recall-ui.mjs

# Test Skip Player Vote component
node tests/skip-vote-ui.mjs

# Test Formations and Team Sheet editor
node tests/formations-ui.mjs

# Test Secret Heroes Mystery Board
node tests/secret-heroes-ui.mjs
```

---

## 🚢 Production Deployment

For detailed production deployment instructions, refer to the [Complete Deployment Guide](DEPLOYMENT.md).

### Quick Deployment Blueprint

1. **Frontend (Vercel)**:
   * Connect your GitHub repository to Vercel.
   * Set root directory to `frontend`.
   * Configure environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_USE_MOCK_DATA=false`.
   * Configure Supabase Auth Redirect URLs with your Vercel production domain.

2. **Backend (Railway / Render / VPS)**:
   * Deploy as a long-running Node.js 22 service (must **not** be serverless due to persistent WebSocket connections and in-memory room sequencing).
   * Build command: `npm run build`.
   * Start command: `node dist/server.js`.
   * Configure environment variables: `PORT`, `HOST=0.0.0.0`, `FRONTEND_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

3. **Database (Supabase PostgreSQL)**:
   * Apply migrations from `supabase/migrations/` sequentially using the Supabase CLI or SQL editor.

---

## 📚 In-Depth Documentation

Explore the detailed architecture and specification documents:

| Guide | Description |
|---|---|
| 📖 [Deployment Guide](DEPLOYMENT.md) | Comprehensive step-by-step production rollout for Vercel, Railway, Render, and VPS |
| 🎮 [Manager Mode Overview](MANAGER_MODE.md) | Technical architecture, snapshot migration, and data flow for tournaments |
| 🏆 [Manager Seasons & Sales](MANAGER_SEASONS.md) | Multi-season tournament lifecycle, player releases, buyouts, and prize pools |
| 💬 [Transfer Negotiations](TRANSFER_NEGOTIATION.md) | Deterministic AI personality engine, Groq LLM integration, and privacy tiers |
| 🦸 [Secret Heroes](SECRET_PLAYERS.md) | 54-player mystery market, Fisher-Yates shuffling, and slot claim mechanics |
| ⏭ [Skip Voting](SKIP_VOTING.md) | Non-host unanimous skip voting rules and WebSocket specifications |
| 🔄 [Player Recall](RECALL_FEATURE.md) | Searchable modal, batch selection, and state transitions for unsold players |
| 🌐 [External Free Agents](EXTERNAL_FREE_AGENTS.md) | 357-player FC24 extraction pipeline and OVR-based baseline pricing economy |
| 🔒 [Auth & Integration](INTEGRATION_FIX.md) | Supabase ES256 JWKS authentication and 760-player catalog deployment |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/DebadritNag/Realtime-Auction/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<div align="center">

Crafted with ⚽ passion for fantasy football tacticians and competitive gamers worldwide.

</div>
