import type { AuthContext, Bid, Player, Purchase, Room, Team } from '../domain/types.js';
import type { RoomSettings } from '../schemas/settings.js';
/** commit must atomically persist the aggregate, bids, purchases, budgets and receipts.
 * It must compare sequence and provide read-your-writes after an uncertain commit.
 * Never implement as a sequence of nontransactional row writes. */
export interface RoomRepository {
  create(room: Room): Promise<void>;
  findByCode(code: string): Promise<Room | null>;
  listRecoverable(): Promise<Room[]>;
  commit(room: Room, expectedSequence: number): Promise<void>;
}
export interface UserRepository { findById(id: string): Promise<AuthContext | null> }
export interface TeamRepository { listForRoom(roomId: string): Promise<Team[]> }
export interface PlayerRepository {
  getPlayer(id: string): Promise<Player | null>;
  listPlayerPool(config: RoomSettings['playerPoolConfig'], teamCount?: number): Promise<Player[]>;
  getPlayersByPot(potId: string): Promise<Player[]>;
}
export interface AuctionRepository { findByRoom(roomId: string): Promise<Room | null> }
export interface BidRepository { listForRoom(roomId: string): Promise<Bid[]>; findLatestForPlayer(roomId: string, playerId: string): Promise<Bid | null> }
export interface PurchaseRepository { listForRoom(roomId: string): Promise<Purchase[]> }
export interface AchievementRepository { listForRoom(roomId: string): Promise<{ teamId: string; kind: string }[]> }
export interface RoomRuntimeHydrator { hydrate(room: Room): Room }
/** Write-side transaction port. Read-side repositories above can be mapped to separate DB tables later. */
export type AuctionUnitOfWork = RoomRepository;
