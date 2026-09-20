// Core domain types for Real-Time Football Auction platform

export type PlayerPosition = "GK" | "DEF" | "MID" | "ATT";

export type PotCategory = string;

export interface PlayerStats {
  pac: number | null;
  sho: number | null;
  pas: number | null;
  dri: number | null;
  def: number | null;
  phy: number | null;
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
  age: number | null;
  preferredFoot: string | null;
  basePrice: number; // In Crores (₹ Cr)
  stats: PlayerStats;
  pot: PotCategory;
  photoUrl?: string;
  status: "waiting" | "live" | "sold" | "unsold" | "skipped";
  soldPrice?: number;
  soldToTeamId?: string;
  soldToTeamName?: string;
}

export interface SquadBreakdown {
  gk: number;
  def: number | null;
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
  auctionsWon: number | null;
  playersPurchased: number;
  totalSpend: number; // in ₹ Cr
  highestPurchase: {
    playerName: string;
    price: number;
    auctionName: string;
    date: string;
  } | null;
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
  status: "LOBBY" | "STARTING" | "LIVE" | "PAUSED" | "COMPLETED" | "CLOSED";
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
  provisional?: boolean;
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
  } | null;
  biggestSpenderTeam: {
    teamName: string;
    totalSpent: number;
  } | null;
  longestBiddingWar: {
    player: Player;
    totalBids: number;
    finalPrice: number;
  } | null;
  mostPlayersPurchased: {
    teamName: string;
    count: number;
  } | null;
  highestRemainingBudget: {
    teamName: string;
    budget: number;
  } | null;
  transfers: {
    player: Player;
    teamName: string;
    price: number;
    timestamp: number;
  }[];
  unsoldList: Player[];
}


export type { ServerEvent, ClientCommand } from "./backend";
