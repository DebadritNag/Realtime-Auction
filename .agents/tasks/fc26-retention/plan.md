# FC26 Database, Underdog pricing and Pre-Auction Retention: Implementation Plan

Repo root: `C:\Users\ASUS\projects\Realtime -Auction` (worked in place; the tree has uncommitted earlier work: player image fixes, ManagerCommandCenter, CupTrophy3D, `postgres-manager.repository.ts`. Never revert it; stage only files you changed, by name).

## 1. Findings: how the app works today

**Live auction state is a single `Room` aggregate, not DB rows.** `backend/src/domain/types.ts` defines `Room` (status, settings, teams, players, purchases, bids, queue). `RoomManager.mutate(code, fn)` (`modules/rooms/room.manager.ts`) takes a per-room `SerialQueue` lock, clones the room, runs `fn`, bumps `sequence`, runs `assertRoom` (`modules/auction/squad.service.ts`), commits via `RoomRepository` (compare-and-swap on sequence), then publishes events. `server.ts` wires `FileRoomRepository` (`STORAGE=file`, atomic rename) or memory. `PostgresRoomRepository` exists but is not wired, and it would not work with non-uuid player ids. Postgres (`DATABASE_URL`, `connectDatabase`) is used only for Manager Mode, profiles, and the archive of a completed auction (`completed-auction-archive.ts`).

**Real-time.** One mechanism: WebSocket `/ws` (`realtime/hub.ts`). Clients send commands validated by `commandSchema` (`modules/auction/auction.schemas.ts`, also `realtime/protocol.ts`). `AuctionEngine.execute` (`modules/auction/auction.engine.ts`) handles them inside `manager.mutate`. After each commit `hub.broadcast` sends the events plus a full `ROOM_STATE` (`modules/rooms/room-state.ts`) to every socket in the room. Reconnect sends `REJOIN_ROOM`, which returns the latest `ROOM_STATE`. Frontend: `services/websocket.service.ts`, `stores/auction.store.ts` (`handleServerEvent`, `ROOM_STATE` is authoritative), `types/backend.ts` (`parseServerEvent` ignores unknown event names). Settings and join go over REST (`modules/rooms/room.routes.ts`).

**Lifecycle today.**
1. `POST /api/rooms` creates the room in `LOBBY` with the host team (`RoomManager.create`).
2. Others `POST /join` (`RoomService.join`, LOBBY only). The host may update settings in LOBBY (`RoomService.updateSettings` or `UPDATE_SETTINGS`); both reset every team's `startingBudgetUnits`.
3. Host sends `START_AUCTION`. The engine loads `players.listPlayerPool(...)`, builds `room.players` (all `WAITING`, `basePriceUnits = max(base, minimumBasePriceCr)`), transitions LOBBY→STARTING→RUNNING, then `activateNext`.
4. `activateNext` picks a random pot among pots with `WAITING` players (anti-streak), then a random player.
5. Resolution (`resolve`) marks the player SOLD (`team.spentUnits`, `team.playerIds`, `room.purchases`) or UNSOLD. Recall only touches `UNSOLD`.
6. `END_AUCTION` leads to COMPLETED. `archiveCompletedAuction` copies the room into `auction_rooms`/`room_members`/`auction_pool`/`player_purchases`/`football_players`, and Manager Mode reads it back through `readCompletedAuction`.

**Money.** Half-Cr integer units (`domain/money.ts`: 15 Cr = 30 units). Remaining purse = `startingBudgetUnits - spentUnits` (`budget.service.ts`). `assertRoom` enforces: budget ledger (`sum(purchases.price) == team.spentUnits`), squad ledger (`purchases.length == team.playerIds.length`), `startingBudgetUnits == toUnits(settings.startingBudgetCr)`, SOLD iff owned, base price >= `minimumBasePriceCr`.

**Pots.** `Player.potId` is a free string. The default FC24 pool uses `GK/DEF/MID/ATT` (`player.service.ts`, `data/default-pool/default-player-pool.csv`, fixed 24/84/84/96 counts scaled by team count in `CatalogPlayerRepository.listPlayerPool`). That scaling only applies inside that repository. Its price tiers (1/2/5/7/9 Cr at 81/84/87/90) are the FC24 pool's and cannot produce the required 1/3/5 Cr, so there is no reusable rating classification. A new central one is needed.

**Players in Postgres.** `football_players` (types in `supabase/types/database.types.ts` and `backend/src/types/database.generated.d.ts`) has: `id uuid`, `external_id text unique`, `name`, `overall`, `position`, `secondary_positions text[]`, `club`, `nationality`, `league`, `age`, `preferred_foot`, `image_url`, `base_price_units`, `pace..physical`, `metadata jsonb`, `active`. There is no `potential`, no draft pool, and no tag. The base schema is not in `supabase/migrations`; only the manager-mode migrations are there. The apply script therefore prints the existing columns and constraints first, as `scripts/apply-cup-schema.mjs` does.

**Frontend.** `app/create/page.tsx` holds the setup form (sections 1 to 3; the "PLAYER DATABASE SOURCE" cards at ~line 630; `handleSourceSelect` blocks everything except `default`). `services/room.service.ts` `createRoom` throws unless the source is `default`. `services/contract.ts` maps DTOs (`mapPlayer`, `mapTeams`, `mapSettings`, `settingsToDTO`). The lobby is `app/room/[roomCode]/page.tsx` (+ `HostControls` START button), and it redirects to `/auction/[roomCode]` when the status is RUNNING. Name-rendering components: `components/auction/{PlayerAuctionCard,PlayerPoolSidebar,SoldOverlay,UnsoldOverlay,CurrentBid,TeamPanel,TeamQuickView,TeamViewDrawer,RecallPlayersModal}.tsx`, `components/results/{AuctionHighlights,TeamResultCard,TransferTable}.tsx`, `components/team/SquadFormationView.tsx`, `components/room/{PlayerCatalogPreview,TeamLobbyCard}.tsx`. Design system in `components/ui/*` (Button, Badge, Modal, ConfirmDialog, Input, EmptyState, ErrorState, Skeleton, Toast) and `components/shared/PlayerImage.tsx` + `lib/player-image.ts`. `frontend/AGENTS.md` says to read `frontend/node_modules/next/dist/docs/` before writing Next.js code (Next 16.3.5). The frontend type check (`npm run typecheck`) forbids importing anything from `backend/`.

**Baseline.** `cd backend; npx tsc -p tsconfig.build.json --noEmit` passes. `npx vitest run` gives 199 passed and 6 failed. The 6 failures already exist and are unrelated: `tests/skip-vote.test.ts` (5) and the skip-voting test in `tests/integration.test.ts` (1) (expected 3 skip votes, received 4). Do not fix them and do not count them as regressions. A frontend `next build` baseline was not run.

## 2. CSV inspection (real files in repo root)

- **The Underdog file is named `FC26_Underdogs.csv` (plural), not `FC26_Underdog.csv`.** Config tries `FC26_Underdog.csv`, then `FC26_Underdogs.csv`, and reports the one it used. The six files are currently untracked in git. Do not copy them into `backend/data` and do not commit them unless the user asks.
- Encoding is UTF-8 with LF line endings. Only the Underdogs file has a BOM (strip it). Every row has the same column count as its header. Quoted multi-value fields ("ST, LW, LM") need the RFC-4180 parser, which already exists as `parseCsv` in `modules/players/player.service.ts` (reuse it; it trims fields).
- Rows: ATT 50, CB 50, Fullbacks 50, GK 20, Mid 50, Underdogs 30 = 250 rows. Regular files have 110 columns. Underdogs has 114: the same 110 plus `draft_pool`, `underdog_tag`, `underdog_reason`, `underdog_position_group`. All 30 underdog rows have `draft_pool=UNDERDOG` and `underdog_tag="Underdog Player"` (the DB tag value we store is `UNDERDOG`, set by the importer from the file origin).
- **Duplicates across files:** 43 ids occur in more than one file (ATT∩Mid, CB∩Fullbacks, Fullbacks∩Mid, ATT∩Fullbacks, CB∩Underdogs ×2, and 241486 in CB+Fullbacks+Mid), so 44 extra rows and **206 unique players**. Overall ranges: regular 81..91, underdog 80..83. Overall >= 90: ATT 4, CB 1, Mid 5 (with overlap), so Top (5 Cr) players are few.
- Every row has `player_face_url` (`https://cdn.sofifa.net/players/231/747/26_120.png`), a club and a nationality. GK rows have empty pace..physic (goalkeeping_* columns are filled instead).

Header mapping (source column → stored field):

| CSV column | Target |
|---|---|
| `player_id` | `fc26_player_id` (identity, unique); room `Player.id` = same string; `Player.externalId` = same |
| `short_name` | `name` (display); `long_name` → `full_name` (secondary line) |
| `player_positions` ("ST, LW, LM") | `position` = first entry (primary); `secondary_positions` = rest; `positions` (all) in memory |
| `overall`, `potential` | `overall`, new `potential` |
| `nationality_name`, `club_name`, `league_name` | `nationality`, `club`, `league` |
| `age`, `preferred_foot` | `age`, `preferred_foot` |
| `pace, shooting, passing, dribbling, defending, physic` | `pace, shooting, passing, dribbling, defending, physical` (null when blank) |
| `player_face_url` | `image_url` |
| every other column (attacking_*, skill_*, movement_*, power_*, mentality_*, defending_*, goalkeeping_*, position ratings `ls..gk`, value/wage/clause, work_rate, body_type, traits, tags, height/weight, reputation, `player_url`, club/league ids, contract fields) | `metadata.fc26.{attributes, positionRatings, ...}` jsonb; nothing dropped |
| Underdogs-only `underdog_reason`, `underdog_position_group` | `metadata.fc26.underdog` |
| (derived) | `draft_pool` (`REGULAR`\|`UNDERDOG`), `player_tag` (`UNDERDOG` or null), `source_category`, `source_categories[]`, `auction_pot`, `base_price_units` |

## 3. Decisions

**D1. Retention lives in the existing room aggregate, as a sub-phase of `LOBBY`.**
- No new `RoomStatus`. This avoids the state machine, the `auction_rooms.status` check constraint, Manager Mode, and every frontend status switch.
- Retention reuses `manager.mutate` (the per-room lock gives atomic, race-safe operations), `assertRoom`, snapshot persistence and `ROOM_STATE` broadcast. That is the one real-time mechanism; nothing new is added.
- `Room.retention?: { phase: 'OPEN'|'FINALIZED'; picks: RetentionPick[]; finalizedAt?: number }`, created only when `settings.retention.enabled`. Old snapshots stay valid.

**D2. Retained players are real purchases.**
- Retaining adds a `Purchase` (`priceUnits` = 30, `acquisitionType: 'RETENTION'`, `isRetained: true`, `bidCount: 0`, `durationMs: 0`), `team.spentUnits += 30`, `team.playerIds.push(id)`, and a `room.players` entry with status `SOLD` (round 0), all in the same commit.
- All existing invariants and remaining-budget/max-bid/reserve logic then hold unchanged.
- "Initial purse reflects deductions" is exposed as `retentionSpentCr`, `auctionPurseCr = starting - retentionSpend`. `startingBudgetUnits` stays the original (the `assertRoom` rule), so reset restores purses exactly.
- Retained players have status SOLD, so they are never selected by `activateNext` (WAITING only), never recalled (UNSOLD only), and never counted as remaining. They stay in `room.players` for team display and history.
- `Purchase` gains optional `acquisitionType`/`isRetained`. `soldPlayers` in `ROOM_STATE` exposes them. `calculateResults` is unchanged (retained purchases count as sales, visible in history and results).

**D3. Pots and the CB/Fullbacks open point.**
- FC26 pots are `GK`, `CB`, `FB`, `MID`, `ATT` (five pots). `CB` and `FB` are new first-class pots. `potId` is a free string, `auction_pots.name` is free text, and `activateNext` is pot-agnostic, so no engine change is needed.
- The broad `Player.position` category (GK/DEF/MID/FWD) stays derived from the primary position (CB/LB/RB/LWB/RWB→DEF, CDM/CM/CAM/LM/RM→MID, rest→FWD), so squad-position stats and formations are unchanged.
- The default FC24 pool keeps `GK/DEF/MID/ATT` and its fixed-count scaling; it is untouched and used only when the source is DEFAULT. Mixing is impossible because the pool source is a room setting.
- Rationale: the brief names Centre-backs and Fullbacks as separate categories, the engine already handles arbitrary pots, and folding them into DEF would lose the distinction the CSV split exists to preserve.
- Draw frequency: the existing "random pot, then random player" gives each pot equal weight (CB pot ≈ 20% of draws). That is current behavior, kept as is.

**D4. Pot assignment rule (deterministic, in one function `assignPot`).**
- Underdog file wins any duplicate (draft_pool=UNDERDOG, 1 Cr). The pot is chosen by the player's primary position: GK→GK, CB→CB, LB/RB/LWB/RWB→FB, CDM/CM/CAM/LM/RM→MID, LW/RW/LF/RF/ST/CF→ATT. This matches the file's own `underdog_position_group` (ATT/MID/CB/Fullback); the importer asserts consistency in tests and does not reject on mismatch.
- A regular player present in one file gets that file's pot (GK→GK, CB→CB, Fullbacks→FB, Mid→MID, ATT→ATT), regardless of primary position, as the brief specifies.
- A regular player present in several files gets the pot of the file matching the primary-position pot if there is one, otherwise the first by priority GK, CB, Fullbacks, Mid, ATT. `source_category` is the winning file; `source_categories` keeps all files.
- Only the winning row is imported; the others count as skipped duplicates.

**D5. Base price: one central module.**
- `backend/src/domain/pricing.ts` exports constants `UNDERDOG_BASE_PRICE_CR=1`, `MEDIUM_BASE_PRICE_CR=3`, `TOP_BASE_PRICE_CR=5`, `TOP_RATING_THRESHOLD=90` (overridable by env `FC26_TOP_RATING_THRESHOLD`, read once in `config/env.ts` and passed in), and `fc26BasePriceUnits({overall, draftPool})`.
- It is computed on import (stored in `football_players.base_price_units`) and recomputed server-side when the pool is prepared at `START_AUCTION` and when the retention list is built. Stored values are never trusted and clients never send prices.
- The room's `minimumBasePriceCr` floor would otherwise raise underdogs to 5 (the create form defaults it to 5). A new helper `parseSettings` (in `schemas/settings.ts`) forces `minimumBasePriceCr = 1` when `playerPoolSource === 'FC26'`. It replaces the `settingsSchema.parse` calls in `room.manager.ts` (create), `room.service.ts` (updateSettings) and `auction.engine.ts` (UPDATE_SETTINGS). The frontend sets and disables that field to 1 for FC26. For the FC26 pool, START does not apply the `Math.max` bump (the floor is 1 anyway).

**D6. Settings and sync.**
- `settingsShape` gains `playerPoolSource: z.enum(['DEFAULT','FC26']).default('DEFAULT')` and `retention: z.object({ enabled: z.boolean().default(false) }).strict().default({})`.
- The fixed constants (price 15 Cr, max 3, min 0) live in `backend/src/domain/retention.ts` and are exposed read-only in `ROOM_STATE.retention.config`. Teams cannot edit them; the settings schema accepts only `enabled`.
- `superRefine`: `retention.enabled` requires `playerPoolSource === 'FC26'` (retention is "from the FC26 database").
- Settings reach all participants through `ROOM_STATE.settings` (existing), and `ROOM_UPDATED` on change.
- Settings changes that affect purses (`startingBudgetCr`, `retention.enabled`, `playerPoolSource`) are blocked once any pick exists or retention is finalized (`RETENTION_LOCKED`, 409); the host resets first.

**D7. Commands (WebSocket, existing pattern).**
- `RETAIN_PLAYER {playerId}`: any member, for their own team only; handled before the host-only `else` branch in `AuctionEngine.execute`, like `PLACE_BID`. Acting for another team is not allowed (nobody else can retain for a team).
- `FINALIZE_RETENTIONS`, `RESET_RETENTIONS`: host only, added to the host switch.
- Retain-time checks, in order: room LOBBY; retention enabled; phase OPEN; member of team; player exists in the FC26 catalog (`RETENTION_PLAYER_NOT_FOUND`, 404); not already retained (`ALREADY_RETAINED_BY_TEAM` / `PLAYER_ALREADY_RETAINED`, 409); team retained < 3 (`RETENTION_LIMIT_REACHED`); squad < max squad size (`SQUAD_FULL`); remaining purse >= 15 Cr (`INSUFFICIENT_PURSE`).
- Finalize needs LOBBY and phase OPEN (0 picks is valid), then sets FINALIZED. Reset is valid in OPEN or FINALIZED, in LOBBY only: it removes every retention purchase, the SOLD player entries and the squad ids, subtracts the spend, and sets phase OPEN with no picks.
- `END_AUCTION` from LOBBY (host closes the room) also resets retentions. `KICK_MEMBER` and `leave` before finalize release that team's picks; after finalize they are rejected with `RETENTION_FINALIZED` until the host resets. `join` after finalize is rejected the same way.
- `START_AUCTION`: if `retention.enabled && phase !== 'FINALIZED'` throw `RETENTION_NOT_FINALIZED` (409). With the FC26 source, the pool is the catalog minus retained ids, recomputed prices; `room.players = [...retainedSoldPlayers, ...poolWaiting]`. Retention OFF takes the unchanged path.
- Events: `PLAYER_RETAINED {pickId, teamId, playerId, priceCr, retainedCount, remainingBudgetCr}`, `RETENTION_FINALIZED {totalRetained, totalSpentCr}`, `RETENTION_RESET {}`, plus the existing `TEAM_UPDATED` and `BUDGET_UPDATED`. Clients rely on the `ROOM_STATE` that follows every commit. Atomicity and concurrent safety come from the room lock: two simultaneous retains of one player serialize, and the second fails with `PLAYER_ALREADY_RETAINED`.

**D8. Persistence and the DB.**
- Authoritative: the room snapshot (atomic file write, CAS on sequence), so refresh and reconnect return the persisted state.
- Migration `supabase/migrations/20261001090000_fc26_database_retention.sql` (additive, idempotent, `if not exists`):
  - `football_players` adds: `fc26_player_id text`, `full_name text`, `potential int`, `draft_pool text check (draft_pool in ('REGULAR','UNDERDOG'))`, `player_tag text check (player_tag is null or player_tag='UNDERDOG')`, `source_category text`, `source_categories text[] default '{}'`, `auction_pot text check (auction_pot in ('GK','CB','FB','MID','ATT'))`; unique partial index on `fc26_player_id`; indexes on `draft_pool` and `auction_pot`.
  - `auction_rooms` adds: `retention_enabled boolean not null default false`, `player_pool_source text not null default 'DEFAULT'`.
  - New `auction_retentions(id uuid pk, room_id uuid not null, team_id uuid not null, player_id uuid not null references football_players(id) on delete restrict, fc26_player_id text not null, retention_price_units bigint not null check (retention_price_units = 30), status text not null check (status in ('ACTIVE','FINALIZED')), created_at timestamptz not null default now(), finalized_at timestamptz)`.
  - Constraints: `unique(room_id, player_id)` and `unique(room_id, fc26_player_id)`, so one retention record per player per room.
  - RLS enabled, privileges revoked from `anon`/`authenticated`, granted to `service_role` (same as the cup migration).
- **Deliberate deviation:** there is no FK from `auction_retentions` to `auction_rooms`/`room_members`. Live rooms are file-snapshot-backed and only copied into those tables at completion, so an FK would reject every mid-lobby write. The FK to `football_players` and the unique constraints are kept.
- FC26 rows get `external_id = NULL` (identity is `fc26_player_id`). The FC24 default pool already archives rows with `external_id = <sofifa id>`, and the same ids exist in FC26, so reusing `external_id` would collide or reuse stale FC24 stats. `completed-auction-archive.ts` is extended to look up `fc26_player_id` for FC26 players, so archiving reuses the master row and never duplicates it.
- A write-behind `RetentionLedger` mirrors picks into `auction_retentions` (idempotent full sync per room, listener on retention events and once at boot recovery) when Postgres is configured. The DB unique constraints are a backstop, errors are logged and retried on the next retention commit, and the in-memory implementation is used in tests and file mode.
- **Applying the migration:** `backend/scripts/apply-fc26-schema.mjs`, same pattern as `apply-cup-schema.mjs`. Without `--apply` it only prints the current columns and constraints of `football_players`, `auction_rooms` and `auction_retentions`. With `--apply` it runs the SQL, verifies RLS/privileges and registers the migration version through `supabase migration repair`. The local `backend/.env` has a `DATABASE_URL` that appears to point at hosted Supabase. **Do not run `--apply` and do not use the Supabase power's `apply_migration` without explicit user confirmation.** The coder verifies SQL syntax by review and runs the script in dry-run mode only if the user has approved that connection. The final report must say the migration is not applied and give the command. The generated types (`supabase/types/database.types.ts`, `backend/src/types/database.generated.d.ts`) are updated by hand to match the migration, in the existing style.

**D9. FC26 catalog and import.**
- New module `backend/src/modules/fc26/`:
  - `fc26.config.ts`: resolves directory and per-file paths. Env: `FC26_DATA_DIR` (default = repo root, resolved from the module location: four levels up from `src/modules/fc26` and `dist/modules/fc26`), and optional per-file overrides `FC26_CSV_GK`, `FC26_CSV_CB`, `FC26_CSV_FULLBACKS`, `FC26_CSV_MID`, `FC26_CSV_ATT`, `FC26_CSV_UNDERDOG`; `FC26_TOP_RATING_THRESHOLD`. Add them to `config/env.ts` and `backend/.env.example` and `backend/ENVIRONMENT.md`.
  - `fc26.importer.ts`: pure `readFc26Files(config)` (missing/unreadable file → reported, not thrown) and `normalizeRow` (zod-validated: numeric id, name, overall 1..99, a known primary position; invalid rows reported with file, row and reason; malformed CSV or missing required headers → file reported invalid, others continue).
  - `fc26.catalog.ts`: `Fc26Catalog` interface (`importAll()`, `list()`, `get(id)`, `search({query, group, offset, limit, excludeIds})`, `stats()`). `MemoryFc26Catalog` (tests/file mode) and `PostgresFc26Catalog` (upserts into `football_players` with `on conflict (fc26_player_id) do nothing`, reads back; a missing-column error 42703/42P01 becomes `FC26_SCHEMA_MISSING` with a message to apply the migration).
  - `fc26.positions.ts`: `assignPot`, `positionGroup` (the search filter groups, below).
  - `fc26.routes.ts`: `GET /api/fc26/status`, `POST /api/fc26/import` (authenticated, rate-limited 5/min, idempotent, **no client-supplied paths**), `GET /api/rooms/:code/retention/players` (member only; `search`, `group`, `offset`, `limit<=100`; excludes retained players; each item has `retainedByTeamId: null`).
- Import report: `{ filesRead, missingFiles[], rowsRead, imported, skippedDuplicates, invalidRows[{file,row,reason}], perFile: {...}, underdogImported }`. A reimport yields `imported: 0` and every row a skipped duplicate. Duplicates inside the files count as skipped duplicates.
- `server.ts` runs an import at boot (non-fatal, logged). It uses Postgres when `managerDb` exists and the schema check passes; otherwise it logs a warning and uses the memory catalog. `app.ts` passes `fc26` into `RoomManager` through a new optional 6th constructor argument (`manager.fc26`).
- Creating or updating a room with `playerPoolSource='FC26'` fails with `FC26_CATALOG_EMPTY` (409) when the catalog is empty.
- `GET /api/players?source=FC26` lets the existing `PlayerCatalogPreview` show the FC26 catalog.

**D10. Position filters** (backend `positionGroup`, a player matches if ANY eligible position is in the group; search also matches the position text): `ALL`, `GK`, `CB`, `FB` (LB/RB/LWB/RWB), `CM` (CDM/CM/CAM), `WM` (LM/RM), `ST` (ST/CF), `W` (LW/RW/LF/RF). The frontend only holds the chip labels and ids.

**D11. Frontend placement.** The retention screen is rendered inside the existing lobby page (`app/room/[roomCode]/page.tsx`) when `snapshot.settings.retention.enabled`, so no new route or redirect logic. The START button stays disabled, with the reason shown, until `retention.phase === 'FINALIZED'`. Retention OFF renders exactly as today.

## 4. Files

**Backend create:** `domain/retention.ts`, `domain/pricing.ts`, `modules/fc26/{fc26.config,fc26.importer,fc26.catalog,fc26.positions,fc26.routes}.ts`, `modules/retention/{retention.service,retention.ledger}.ts`, `backend/scripts/apply-fc26-schema.mjs`, `supabase/migrations/20261001090000_fc26_database_retention.sql`, `backend/tests/{fc26-import,fc26-pricing,retention}.test.ts`, `backend/tests/fixtures/fc26/*.csv`.
**Backend modify:** `domain/types.ts` (Player fields, Purchase fields, `Room.retention`), `schemas/settings.ts`, `config/env.ts`, `modules/rooms/{room.manager,room.service,room.routes,room-state}.ts`, `modules/auction/{auction.engine,auction.schemas,squad.service}.ts`, `modules/teams/team.service.ts`, `realtime/protocol.ts` (only if the union needs it), `modules/players/player.routes.ts`, `modules/manager-mode/completed-auction-archive.ts`, `app.ts`, `server.ts`, `.env.example`, `ENVIRONMENT.md`, `WEBSOCKET_PROTOCOL.md`, `AUCTION_RULES.md`, `tests/helpers.ts`, `supabase/types/database.types.ts`, `src/types/database.generated.d.ts`.
**Frontend create:** `components/shared/UnderdogTag.tsx`, `components/retention/{RetentionScreen,RetentionTeamSwitcher,RetentionFilters,RetentionPlayerCard,RetainedPlayersPanel,FinalizeRetentionsDialog}.tsx`, `components/fc26/Fc26ImportPanel.tsx`, `services/fc26.service.ts`, `services/retention.service.ts`, `lib/pots.ts`, `tests/retention-ui.mjs` (same style as `tests/recall-ui.mjs`).
**Frontend modify:** `types/index.ts`, `types/backend.ts`, `services/{contract,room.service}.ts`, `stores/auction.store.ts` (tag/retention event handling only), `app/create/page.tsx`, `app/room/[roomCode]/page.tsx`, `components/room/{HostControls,PlayerCatalogPreview,TeamLobbyCard}.tsx`, `components/auction/{PlayerAuctionCard,PlayerPoolSidebar,SoldOverlay,UnsoldOverlay,CurrentBid,TeamPanel,TeamQuickView,TeamViewDrawer,RecallPlayersModal}.tsx`, `components/results/{AuctionHighlights,TeamResultCard,TransferTable}.tsx`, `components/team/SquadFormationView.tsx`.

## 5. Ordered work (the workflow runs these as three sequential FEAT steps, then a review loop)

- [ ] 1. **FEAT-001 backend FC26 data layer.** Migration + apply script + generated types; `pricing.ts`; `fc26.*` modules (config, importer, catalog, positions, routes); `Player` fields; settings (`playerPoolSource`, `retention.enabled`, `parseSettings`, floor to 1 Cr); env/docs; wiring in `app.ts`/`server.ts`; archive lookup by `fc26_player_id`; `player.routes.ts` `source=FC26`; tests. `START_AUCTION` with the FC26 source builds the pool from the catalog (no retention yet).
  Verify: `cd backend; npx tsc -p tsconfig.build.json --noEmit`; `npx vitest run tests/fc26-import.test.ts tests/fc26-pricing.test.ts` pass; full `npx vitest run` shows only the 6 baseline failures.
- [ ] 2. **FEAT-002 backend retention.** `retention.ts`, `retention.service.ts`, ledger, `Room.retention`/`Purchase` fields, three commands + events + guards (START, join, leave, kick, settings lock, END_AUCTION reset), `assertRoom` retention invariants, `roomState`/`publicTeam` fields, retention players route, docs; tests.
  Verify: `npx tsc -p tsconfig.build.json --noEmit`; `npx vitest run tests/retention.test.ts`; full suite shows only the 6 baseline failures.
- [ ] 3. **FEAT-003 frontend.** Types/contract/services; create page (FC26 option, import panel with report, Player Retention toggle with fixed-price info and the exact explanation text, FC26 forces min base price 1); retention screen in the lobby; UNDERDOG tag everywhere listed; pot labels; HostControls gating; frontend test.
  Verify: `cd frontend; npm run typecheck`; `npx next build`; `node tests/retention-ui.mjs` (needs Playwright chromium; if it cannot launch, say so).
- [ ] 4. **Convergence loop** (fixer + reviewer, max 2 iterations): full backend tsc + vitest, frontend typecheck + build, and a walk of Create Setup → Retention → Start as an integration test through `RoomManager` + `AuctionEngine` (`tests/retention.test.ts` "full flow" case), plus the final report.

## 6. Test coverage map (brief → test)

All six CSVs import (real repo files if present, else skipped, plus fixtures); reimport imports 0 and skips all; Underdog rows get `draft_pool` and `player_tag` UNDERDOG, regular get null tag; position mapping and pot assignment (including multi-position, cross-file duplicates, underdog by primary position); base prices 1/3/5 and the threshold override; missing/malformed file does not throw and is reported; retain 0/1/2/3; 4th blocked; cost exactly 15 Cr (30 units); insufficient purse; same player by two teams, sequentially and with `Promise.all`; player not in catalog rejected; retained absent from the queue across a full auction run (never ACTIVE); retention OFF skips the phase and START unchanged; START blocked before finalize; purses after finalize; reset restores purses and clears picks; non-host cannot finalize/reset; settings locked after picks; kick/leave releases picks; `ROOM_STATE.retention` content; bidding, sold, unsold, recall and history regression through the existing suites.

## Digest

| File | Block to change | Covered by | Verified |
|---|---|---|---|
| `backend/src/schemas/settings.ts` | `settingsShape` (+2 fields), `settingsSchema` superRefine, new `parseSettings` | `tests/retention.test.ts`, existing `auction.test.ts` | read; `settingsSchema.parse` is called in room.manager.ts `create`, room.service.ts `updateSettings`, auction.engine.ts `START_AUCTION` and `UPDATE_SETTINGS`, squad.service.ts `assertRoom` |
| `backend/src/domain/types.ts` | `Player` (+`draftPool, playerTag, sourceCategory, positions, potential, fullName`), `Purchase` (+`acquisitionType, isRetained`), `Room` (+`retention?`) | all | read |
| `backend/src/modules/auction/auction.engine.ts` | `execute`: new member branch for `RETAIN_PLAYER` before `else { requireHost }`; host switch cases `FINALIZE_RETENTIONS`, `RESET_RETENTIONS`; `START_AUCTION` guard + FC26 pool + retained players kept; `KICK_MEMBER`; `END_AUCTION` in LOBBY | `tests/retention.test.ts`; existing `auction.test.ts`, `recall.test.ts` | read; `activateNext` selects `WAITING` only, `START_RECALL`/`RECALL_PLAYERS` use `UNSOLD` only |
| `backend/src/modules/auction/auction.schemas.ts` | `commandSchema` union (+3 commands) | retention tests | read |
| `backend/src/modules/auction/squad.service.ts` | `assertRoom` (+retention invariants only when `room.retention` exists) | retention tests | read; all existing invariants unchanged |
| `backend/src/modules/rooms/room.manager.ts` | constructor (+6th optional arg `fc26`), `create` uses `parseSettings` | `tests/helpers.ts` fixtures | read |
| `backend/src/modules/rooms/room.service.ts` | `join`, `leave`, `updateSettings` (retention guards, `parseSettings`) | retention tests | read |
| `backend/src/modules/rooms/room-state.ts`, `modules/teams/team.service.ts` | `roomState` (+`retention`, `soldPlayers` fields), `publicTeam` (+`retainedCount`, `retentionSpentCr`, `auctionPurseCr`) | retention tests, `skip-vote.test.ts` reads `roomState` (baseline failing) | read |
| `backend/src/modules/manager-mode/completed-auction-archive.ts` | `known` lookup + `found` match (+`fc26_player_id`) | manual review; no DB in tests | read |
| `backend/src/app.ts`, `server.ts`, `config/env.ts` | pass `fc26` to `RoomManager`; boot import; register routes; env vars | `fc26-import.test.ts` (config), tsc | read |
| `frontend/src/app/create/page.tsx` | `handleSourceSelect`, source cards grid, new retention card | `next build`, `tests/retention-ui.mjs` | read; only `default` is selectable today |
| `frontend/src/services/room.service.ts` | `createRoom` guard (`playerPoolSource !== 'default'`) | `next build` | read |
| `frontend/src/services/contract.ts` | `mapPlayer`, `mapSettings`, `settingsToDTO` | `npm run typecheck` | read; `mapSettings` hard-codes `playerPoolSource:'default'` |
| `frontend/src/app/room/[roomCode]/page.tsx`, `components/room/HostControls.tsx` | embed `RetentionScreen`; START gating | `next build` | read |

Build/test commands: backend `cd backend; npx tsc -p tsconfig.build.json --noEmit` (passes today), `npx vitest run` (199 pass, 6 fail today in `skip-vote.test.ts` and `integration.test.ts`, unrelated); frontend `cd frontend; npm run typecheck`, `npx next build` (not run in planning).
