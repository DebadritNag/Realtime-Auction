// Core domain types for Real-Time Football Auction platform

export type PlayerPosition = "GK" | "DEF" | "MID" | "ATT";

export type PotCategory =
  | "elite"
  | "attackers"
  | "midfielders"
  | "defenders"
  | "goalkeepers"
  | "wildcard"
  | "recall";

export interface PlayerStats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface Player {
  id: string;
  name: string;
  ovr: number;
  position: PlayerPosition;
  subPosition?: string; // e.g. "ST", "CB", "CM"
  club: string;
  nationality: string;
  flagEmoji: string;
  age: number;
  preferredFoot: "Right" | "Left" | "Both";
  basePrice: number; // In Crores (₹ Cr)
  stats: PlayerStats;
  pot: PotCategory;
  photoUrl?: string;
  status: "waiting" | "live" | "sold" | "unsold";
  soldPrice?: number;
  soldToTeamId?: string;
  soldToTeamName?: string;
}

export interface SquadBreakdown {
  gk: number;
  def: number;
  mid: number;
  att: number;
  total: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string; // emoji or SVG/image icon
  accentColor: string;
  managerId: string;
  managerUsername: string;
  isCurrentUser?: boolean;
  budgetTotal: number; // Starting purse in ₹ Cr
  budgetSpent: number; // Spent in ₹ Cr
  budgetRemaining: number; // Remaining in ₹ Cr
  squadCount: number;
  squad: Player[];
  positions: SquadBreakdown;
  ready: boolean;
  connected: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  defaultTeamName: string;
  defaultTeamLogo: string;
}

export interface UserCareerStats {
  auctionsPlayed: number;
  auctionsWon: number;
  playersPurchased: number;
  totalSpend: number; // in ₹ Cr
  highestPurchase: {
    playerName: string;
    price: number;
    auctionName: string;
    date: string;
  };
  averagePurchase: number; // in ₹ Cr
  roomsHosted: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface AuctionHistoryRecord {
  id: string;
  auctionName: string;
  roomCode: string;
  date: string;
  teamUsed: string;
  playersPurchased: number;
  moneySpent: number;
  status: "COMPLETED" | "ACTIVE" | "ABANDONED";
}

export interface RoomSettings {
  auctionName: string;
  numberOfTeams: number;
  startingBudget: number; // in ₹ Cr (e.g. 150)
  minSquadSize: number;
  maxSquadSize: number;
  playerTimerSeconds: number; // e.g. 15
  antiSnipingEnabled: boolean;
  antiSnipingThresholdSeconds: number; // e.g. 5
  timerResetDurationSeconds: number; // e.g. 5
  minPlayerBasePrice: number; // e.g. 2
  playerPoolSource: "default" | "csv" | "custom";
  filters?: {
    minOvr: number;
    maxOvr: number;
    gkCount: number;
    defCount: number;
    midCount: number;
    attCount: number;
  };
}

export interface RoomParticipant {
  userId: string;
  username: string;
  teamId?: string;
  teamName?: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

export interface AuctionRoom {
  roomCode: string;
  name: string;
  hostId: string;
  hostUsername: string;
  status: "LOBBY" | "LIVE" | "PAUSED" | "COMPLETED";
  settings: RoomSettings;
  teams: Team[];
  participants: RoomParticipant[];
  createdAt: string;
}

export interface Bid {
  id: string;
  amount: number; // in ₹ Cr
  teamId: string;
  teamName: string;
  teamShortName: string;
  teamLogo: string;
  bidderId: string;
  bidderUsername: string;
  timestamp: number;
}

export interface AISuggestion {
  recommendedRange: [number, number]; // [min, max] in ₹ Cr
  suggestedCeiling: number; // Max prudent bid in ₹ Cr
  reasons: string[];
  warnings: string[];
  riskLevel: "LOW RISK" | "BALANCED" | "HIGH RISK";
}

export interface AuctionAnalytics {
  roomCode: string;
  auctionName: string;
  totalTeams: number;
  playersSold: number;
  totalSpend: number; // in ₹ Cr
  unsoldPlayers: number;
  averageSale: number; // in ₹ Cr
  mostExpensivePlayer: {
    player: Player;
    price: number;
    boughtByTeam: string;
  };
  biggestSpenderTeam: {
    teamName: string;
    totalSpent: number;
  };
  longestBiddingWar: {
    player: Player;
    totalBids: number;
    finalPrice: number;
  };
  mostPlayersPurchased: {
    teamName: string;
    count: number;
  };
  highestRemainingBudget: {
    teamName: string;
    budget: number;
  };
  transfers: {
    player: Player;
    teamName: string;
    price: number;
    timestamp: number;
  }[];
  unsoldList: Player[];
}

// WebSocket Event Payloads
export interface RoomStateEvent {
  type: "ROOM_STATE";
  roomCode: string;
  status: "LOBBY" | "LIVE" | "PAUSED" | "COMPLETED";
  currentPot: PotCategory;
  activePlayer: Player | null;
  currentBid: number;
  highestBidder: Team | null;
  endsAt: number | null; // Server epoch timestamp
  estimatedServerNow: number; // Server epoch timestamp for clock-drift sync
  minimumNextBid: number;
  teams: Team[];
  recentBids: Bid[];
  aiSuggestion?: AISuggestion;
}

export interface PlayerStartedEvent {
  type: "PLAYER_STARTED";
  player: Player;
  basePrice: number;
  endsAt: number;
  minimumNextBid: number;
  currentPot: PotCategory;
  aiSuggestion?: AISuggestion;
}

export interface BidAcceptedEvent {
  type: "BID_ACCEPTED";
  bid: Bid;
  minimumNextBid: number;
  endsAt: number;
  antiSnipingTriggered: boolean;
  extensionSeconds?: number;
}

export interface BidRejectedEvent {
  type: "BID_REJECTED";
  reason: string;
  attemptedAmount: number;
  minimumNextBid: number;
}

export interface BidUpdatedEvent {
  type: "BID_UPDATED";
  currentBid: number;
  highestBidder: Team;
  minimumNextBid: number;
  endsAt: number;
}

export interface TimerExtendedEvent {
  type: "TIMER_EXTENDED";
  extensionSeconds: number;
  newEndsAt: number;
  reason: string;
}

export interface PlayerSoldEvent {
  type: "PLAYER_SOLD";
  player: Player;
  winningTeam: Team;
  soldPrice: number;
  nextPlayerInSeconds: number;
}

export interface PlayerUnsoldEvent {
  type: "PLAYER_UNSOLD";
  player: Player;
  nextPlayerInSeconds: number;
  recallPoolCount: number;
}

export interface NextPlayerEvent {
  type: "NEXT_PLAYER";
  player: Player;
  endsAt: number;
  minimumNextBid: number;
}

export interface AuctionPausedEvent {
  type: "AUCTION_PAUSED";
  pausedBy: string;
  reason?: string;
}

export interface AuctionResumedEvent {
  type: "AUCTION_RESUMED";
  endsAt: number;
}

export interface TeamUpdatedEvent {
  type: "TEAM_UPDATED";
  team: Team;
}

export interface BudgetUpdatedEvent {
  type: "BUDGET_UPDATED";
  teamId: string;
  budgetRemaining: number;
  budgetSpent: number;
}

export interface AuctionCompletedEvent {
  type: "AUCTION_COMPLETED";
  roomCode: string;
  redirectUrl: string;
}

export interface ConnectionStatusEvent {
  type: "CONNECTION_STATUS";
  status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  latencyMs?: number;
}

// ── Backend-aligned server event types ─────────────────────────────────────
// The backend sends these exact type strings. The auction.store handles them.

export interface BackendRoomStateEvent {
  type: "ROOM_STATE";
  roomId: string;
  sequence: number;
  serverTime: number;
  requestId?: string;
  payload: unknown; // BackendRoomState — handled by adapters.ts
}

export interface BackendAuctionStartedEvent {
  type: "AUCTION_STARTED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: Record<string, never>;
}

export interface BackendAuctionPausedEvent {
  type: "AUCTION_PAUSED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { remainingTimeMs: number | null };
}

export interface BackendAuctionResumedEvent {
  type: "AUCTION_RESUMED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { endsAt: number | null };
}

export interface BackendAuctionCompletedEvent {
  type: "AUCTION_COMPLETED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: Record<string, never>;
}

export interface BackendBidUpdatedEvent {
  type: "BID_UPDATED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: {
    playerId: string;
    amountCr: number;
    highestBidderTeamId: string;
    minimumNextBidCr: number;
    endsAt: number;
    bidCount: number;
  };
}

export interface BackendBidRejectedEvent {
  type: "BID_REJECTED";
  roomId?: string;
  sequence: number;
  serverTime: number;
  requestId?: string;
  payload: {
    reason: string;
    message: string;
    minimumNextBidCr?: number;
  };
}

export interface BackendPlayerStartedEvent {
  type: "PLAYER_STARTED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: {
    player: unknown; // BackendPublicPlayer
    basePriceCr: number;
    currentBidCr: number;
    minimumNextBidCr: number;
    highestBidderTeamId: null;
    startedAt: number;
    endsAt: number;
  };
}

export interface BackendPlayerSoldEvent {
  type: "PLAYER_SOLD";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: {
    playerId: string;
    teamId: string;
    priceCr: number;
    remainingBudgetCr: number;
    teamPlayerCount: number;
  };
}

export interface BackendPlayerUnsoldEvent {
  type: "PLAYER_UNSOLD";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { playerId: string };
}

export interface BackendTimerExtendedEvent {
  type: "TIMER_EXTENDED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { playerId: string; endsAt: number };
}

export interface BackendBudgetUpdatedEvent {
  type: "BUDGET_UPDATED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { teamId: string; spentCr: number; remainingBudgetCr: number };
}

export interface BackendMemberJoinedEvent {
  type: "MEMBER_JOINED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { teamId: string };
}

export interface BackendMemberLeftEvent {
  type: "MEMBER_LEFT";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { userId?: string; teamId?: string };
}

export interface BackendRoomUpdatedEvent {
  type: "ROOM_UPDATED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { reason?: string };
}

export interface BackendPresenceUpdatedEvent {
  type: "PRESENCE_UPDATED";
  roomId: string;
  sequence: number;
  serverTime: number;
  payload: { connectedUsers: string[] };
}

export interface BackendConnectedEvent {
  type: "CONNECTED";
  sequence: 0;
  serverTime: number;
  payload: { connectionId: string; userId: string; heartbeatIntervalMs: number };
}

export interface BackendCommandAckEvent {
  type: "COMMAND_ACK";
  sequence: number;
  serverTime: number;
  requestId?: string;
  payload: { sequence: number; duplicate: boolean };
}

export interface BackendErrorEvent {
  type: "ERROR";
  sequence: number;
  serverTime: number;
  requestId?: string;
  payload: { reason: string; message: string };
}

export interface BackendPongEvent {
  type: "PONG";
  sequence: number;
  serverTime: number;
  payload: Record<string, never>;
}

export type ServerEvent =
  // Frontend-normalised events (used by components/stores)
  | RoomStateEvent
  | PlayerStartedEvent
  | BidAcceptedEvent
  | BidRejectedEvent
  | BidUpdatedEvent
  | TimerExtendedEvent
  | PlayerSoldEvent
  | PlayerUnsoldEvent
  | NextPlayerEvent
  | AuctionPausedEvent
  | AuctionResumedEvent
  | TeamUpdatedEvent
  | BudgetUpdatedEvent
  | AuctionCompletedEvent
  | ConnectionStatusEvent
  // Backend wire events (handled by auction.store via adapters)
  | BackendRoomStateEvent
  | BackendAuctionStartedEvent
  | BackendAuctionPausedEvent
  | BackendAuctionResumedEvent
  | BackendAuctionCompletedEvent
  | BackendBidUpdatedEvent
  | BackendBidRejectedEvent
  | BackendPlayerStartedEvent
  | BackendPlayerSoldEvent
  | BackendPlayerUnsoldEvent
  | BackendTimerExtendedEvent
  | BackendBudgetUpdatedEvent
  | BackendMemberJoinedEvent
  | BackendMemberLeftEvent
  | BackendRoomUpdatedEvent
  | BackendPresenceUpdatedEvent
  | BackendConnectedEvent
  | BackendCommandAckEvent
  | BackendErrorEvent
  | BackendPongEvent
  // Connection status (internal)
  | { type: "CONNECTION_STATUS"; status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED"; latencyMs?: number };

// ── Backend client commands (exact wire format) ───────────────────────────────
// These are sent by websocket.service.ts as { type, requestId?, payload }.
// The legacy ClientCommand union is kept for mock compatibility.

export type ClientCommand =
  | { type: "JOIN_ROOM"; roomCode: string; teamName?: string; teamLogo?: string }
  | { type: "PLACE_BID"; roomCode: string; amount?: number; amountCr?: number }
  | { type: "REQUEST_SYNC"; roomCode: string }
  | { type: "REQUEST_STATE"; roomCode: string }
  | { type: "REJOIN_ROOM"; roomCode: string }
  | { type: "START_AUCTION"; roomCode: string }
  | { type: "PAUSE_AUCTION"; roomCode: string }
  | { type: "RESUME_AUCTION"; roomCode: string }
  | { type: "NEXT_PLAYER"; roomCode: string }
  | { type: "MARK_UNSOLD"; roomCode: string }
  | { type: "END_AUCTION"; roomCode: string }
  | { type: "KICK_MEMBER"; roomCode: string; targetTeamId: string }
  // Legacy mock aliases (still used by mockWebSocket.ts)
  | { type: "HOST_START_AUCTION"; roomCode: string }
  | { type: "HOST_PAUSE"; roomCode: string }
  | { type: "HOST_RESUME"; roomCode: string }
  | { type: "HOST_SKIP_PLAYER"; roomCode: string }
  | { type: "HOST_MARK_UNSOLD"; roomCode: string }
  | { type: "HOST_RECALL_UNSOLD"; roomCode: string }
  | { type: "HOST_END_AUCTION"; roomCode: string };
