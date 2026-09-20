/**
 * adapters.ts — Translate the Fastify backend wire format into the frontend
 * domain types used by stores and components.
 *
 * Backend wire format key facts:
 *  - Money fields end in "Cr" and are decimal crores (e.g. 22.5)
 *  - position values are "GK" | "DEF" | "MID" | "FWD"  (not "ATT")
 *  - teamId in Fastify = room_members.id
 *  - ROOM_STATE has full sub-objects; individual events carry partial data
 *  - After every command, backend sends the specific event THEN a full ROOM_STATE
 *
 * Frontend types use:
 *  - budgetTotal/budgetSpent/budgetRemaining (numbers, in Cr)
 *  - activePlayer: Player | null
 *  - currentBid / minimumNextBid (numbers, in Cr)
 *  - position: "GK" | "DEF" | "MID" | "ATT"
 */

import type {
  Player,
  Team,
  Bid,
  AISuggestion,
  PotCategory,
  AuctionRoom,
  RoomSettings,
} from "@/types";

// ── Backend wire shapes (minimal — only what we use) ─────────────────────────

export interface BackendPublicPlayer {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ovr: number;
  stats: Record<string, number>;
  potId: string;
  status?: string;
  round?: number;
  basePriceCr: number;
  // extras sometimes present
  club?: string;
  nationality?: string;
  age?: number;
  preferredFoot?: string;
  photoUrl?: string;
}

export interface BackendPublicTeam {
  id: string;
  userId: string;
  name: string;
  logoUrl?: string;
  startingBudgetCr: number;
  spentCr: number;
  remainingBudgetCr: number;
  playerIds: string[];
  playersOwned: number;
  maximumPermittedBidCr: number;
  minimumSquadMet: boolean;
}

export interface BackendSoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  bidCount: number;
  at: number;
  durationMs: number;
  priceCr: number;
}

export interface BackendRoomSettings {
  numberOfTeams: number;
  minimumParticipants: number;
  startingBudgetCr: number;
  minSquadSize: number;
  maxSquadSize: number;
  playerTimerSeconds: number;
  antiSnipingEnabled: boolean;
  antiSnipingThresholdSeconds: number;
  antiSnipingResetSeconds: number;
  minimumBasePriceCr: number;
  allowCustomBids: boolean;
  autoAdvance: boolean;
  transitionDelaySeconds: number;
  playerPoolConfig?: { playerIds?: string[]; potIds?: string[] };
}

export interface BackendRoomState {
  // Identity
  roomId: string;
  roomCode: string;
  room: { id: string; code: string; auctionName: string; createdAt: number };
  settings: BackendRoomSettings;
  status: string;
  host: { userId: string; teamId?: string };

  // Active auction state
  currentPlayer: BackendPublicPlayer | null;
  activePotId: string | null;
  activePlayerId: string | null;
  currentBidCr: number | null;
  highestBidderTeamId: string | null;
  minimumNextBidCr: number | null;
  maximumPermittedBidCr: number;
  startedAt: number | null;
  endsAt: number | null;
  remainingTimeMs: number | null;
  biddingOpen: boolean;
  lastBidAt: number | null;
  bidCount: number;
  nextPlayerAt: number | null;

  // Timing
  serverTime: number;
  sequence: number;

  // Teams
  teams: BackendPublicTeam[];
  currentUserTeam: BackendPublicTeam;

  // Presence
  connectedUsers: string[];

  // Players
  playerQueue: string[];
  playerQueueSummary: { remaining: number };
  players: BackendPublicPlayer[];
  soldPlayers: BackendSoldRecord[];
  unsoldPlayers: BackendPublicPlayer[];
}

export interface BackendRecommendation {
  recommendedMinCr: number;
  recommendedMaxCr: number;
  suggestedCeilingCr: number;
  budgetRisk: "LOW" | "MEDIUM" | "HIGH";
  squadNeedScore: number;
  scarcityScore: number;
  reasons: string[];
  warnings: string[];
  sequence: number;
  serverTime: number;
  playerId?: string;
}

// ── Pot name lookup ───────────────────────────────────────────────────────────
// Fastify uses potId UUIDs; the frontend uses PotCategory strings.
// We map potId → name as a best-effort from the players list.
function potIdToCategory(potId: string | null, players: BackendPublicPlayer[]): PotCategory {
  if (!potId) return "elite";
  // Try to infer from the pot name if available in player metadata
  const lower = potId.toLowerCase();
  if (lower.includes("elite") || lower.includes("icon")) return "elite";
  if (lower.includes("attack")) return "attackers";
  if (lower.includes("mid")) return "midfielders";
  if (lower.includes("defend") || lower.includes("def")) return "defenders";
  if (lower.includes("goal") || lower.includes("gk")) return "goalkeepers";
  if (lower.includes("wild")) return "wildcard";
  if (lower.includes("recall") || lower.includes("unsold")) return "recall";
  // fallback: look at first player with this potId
  const sample = players.find((p) => p.potId === potId);
  if (sample?.position === "GK") return "goalkeepers";
  if (sample?.position === "DEF") return "defenders";
  if (sample?.position === "MID") return "midfielders";
  if (sample?.position === "FWD") return "attackers";
  return "elite";
}

// ── Position mapping ──────────────────────────────────────────────────────────
// Backend: GK | DEF | MID | FWD
// Frontend: GK | DEF | MID | ATT
function mapPosition(pos: string): "GK" | "DEF" | "MID" | "ATT" {
  if (pos === "FWD") return "ATT";
  if (pos === "GK" || pos === "DEF" || pos === "MID") return pos as "GK" | "DEF" | "MID";
  return "ATT";
}

// ── Player adapter ────────────────────────────────────────────────────────────
export function adaptPlayer(
  bp: BackendPublicPlayer,
  status: Player["status"] = "waiting"
): Player {
  return {
    id: bp.id,
    name: bp.name,
    ovr: bp.ovr,
    position: mapPosition(bp.position),
    subPosition: bp.position, // keep original as subPosition
    club: bp.club ?? "",
    nationality: bp.nationality ?? "",
    flagEmoji: "",
    age: bp.age ?? 0,
    preferredFoot: (bp.preferredFoot as "Right" | "Left" | "Both") ?? "Right",
    basePrice: bp.basePriceCr,
    stats: {
      pac: bp.stats?.pac ?? bp.stats?.pace ?? 0,
      sho: bp.stats?.sho ?? bp.stats?.shooting ?? 0,
      pas: bp.stats?.pas ?? bp.stats?.passing ?? 0,
      dri: bp.stats?.dri ?? bp.stats?.dribbling ?? 0,
      def: bp.stats?.def ?? bp.stats?.defending ?? 0,
      phy: bp.stats?.phy ?? bp.stats?.physical ?? 0,
    },
    pot: potIdToCategory(bp.potId, [bp]),
    photoUrl: bp.photoUrl,
    status,
  };
}

// ── Team adapter ──────────────────────────────────────────────────────────────
export function adaptTeam(
  bt: BackendPublicTeam,
  currentUserId: string | null,
  players: BackendPublicPlayer[] = []
): Team {
  const ownedPlayers = players
    .filter((p) => bt.playerIds.includes(p.id))
    .map((p) => adaptPlayer(p, "sold"));

  const gk = ownedPlayers.filter((p) => p.position === "GK").length;
  const def = ownedPlayers.filter((p) => p.position === "DEF").length;
  const mid = ownedPlayers.filter((p) => p.position === "MID").length;
  const att = ownedPlayers.filter((p) => p.position === "ATT").length;

  return {
    id: bt.id,
    name: bt.name,
    shortName: bt.name.slice(0, 4).toUpperCase(),
    logo: bt.logoUrl ?? "⚽",
    accentColor: "#00FF87",
    managerId: bt.userId,
    managerUsername: bt.userId,
    isCurrentUser: bt.userId === currentUserId,
    budgetTotal: bt.startingBudgetCr,
    budgetSpent: bt.spentCr,
    budgetRemaining: bt.remainingBudgetCr,
    squadCount: bt.playersOwned,
    squad: ownedPlayers,
    positions: { gk, def, mid, att, total: ownedPlayers.length },
    ready: true,
    connected: true,
  };
}

// ── AI suggestion adapter ─────────────────────────────────────────────────────
export function adaptRecommendation(r: BackendRecommendation): AISuggestion {
  const risk: AISuggestion["riskLevel"] =
    r.budgetRisk === "LOW" ? "LOW RISK"
    : r.budgetRisk === "HIGH" ? "HIGH RISK"
    : "BALANCED";

  return {
    recommendedRange: [r.recommendedMinCr, r.recommendedMaxCr],
    suggestedCeiling: r.suggestedCeilingCr,
    reasons: r.reasons,
    warnings: r.warnings,
    riskLevel: risk,
  };
}

// ── ROOM_STATE adapter ────────────────────────────────────────────────────────
/**
 * Converts the full BackendRoomState payload into the shape the frontend
 * auction store expects on a ROOM_STATE event.
 */
export function adaptRoomState(
  payload: BackendRoomState,
  currentUserId: string | null
): {
  roomCode: string;
  status: "LOBBY" | "LIVE" | "PAUSED" | "COMPLETED";
  currentPot: PotCategory;
  activePlayer: Player | null;
  currentBid: number;
  highestBidder: Team | null;
  endsAt: number | null;
  estimatedServerNow: number;
  minimumNextBid: number;
  teams: Team[];
  recentBids: Bid[];
  aiSuggestion: AISuggestion | undefined;
  sequence: number;
  hostUserId: string;
  hostTeamId: string | undefined;
} {
  const statusMap: Record<string, "LOBBY" | "LIVE" | "PAUSED" | "COMPLETED"> = {
    LOBBY: "LOBBY",
    STARTING: "LOBBY",
    RUNNING: "LIVE",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED",
    CLOSED: "COMPLETED",
  };

  const teams = payload.teams.map((bt) =>
    adaptTeam(bt, currentUserId, payload.players)
  );

  const currentBid = payload.currentBidCr ?? payload.currentPlayer?.basePriceCr ?? 0;
  const minimumNextBid = payload.minimumNextBidCr ?? currentBid;

  const highestBidder = payload.highestBidderTeamId
    ? teams.find((t) => t.id === payload.highestBidderTeamId) ?? null
    : null;

  const activePlayer = payload.currentPlayer
    ? adaptPlayer(payload.currentPlayer, "live")
    : null;

  const currentPot = potIdToCategory(
    payload.activePotId ?? payload.currentPlayer?.potId ?? null,
    payload.players
  );

  return {
    roomCode: payload.roomCode,
    status: statusMap[payload.status] ?? "LOBBY",
    currentPot,
    activePlayer,
    currentBid,
    highestBidder,
    endsAt: payload.endsAt,
    estimatedServerNow: payload.serverTime,
    minimumNextBid,
    teams,
    recentBids: [], // individual bids come via BID_UPDATED events
    aiSuggestion: undefined,
    sequence: payload.sequence,
    hostUserId: payload.host.userId,
    hostTeamId: payload.host.teamId,
  };
}

// ── RoomSettings adapter ──────────────────────────────────────────────────────
export function adaptRoomSettings(bs: BackendRoomSettings): RoomSettings {
  return {
    auctionName: "", // filled by caller from room.auctionName
    numberOfTeams: bs.numberOfTeams,
    startingBudget: bs.startingBudgetCr,
    minSquadSize: bs.minSquadSize,
    maxSquadSize: bs.maxSquadSize,
    playerTimerSeconds: bs.playerTimerSeconds,
    antiSnipingEnabled: bs.antiSnipingEnabled,
    antiSnipingThresholdSeconds: bs.antiSnipingThresholdSeconds,
    timerResetDurationSeconds: bs.antiSnipingResetSeconds,
    minPlayerBasePrice: bs.minimumBasePriceCr,
    playerPoolSource: "default",
  };
}

// ── AuctionRoom adapter ───────────────────────────────────────────────────────
export function adaptRoomStateToAuctionRoom(
  payload: BackendRoomState,
  currentUserId: string | null
): AuctionRoom {
  const settings = adaptRoomSettings(payload.settings);
  settings.auctionName = payload.room.auctionName;

  const teams = payload.teams.map((bt) =>
    adaptTeam(bt, currentUserId, payload.players)
  );

  return {
    roomCode: payload.roomCode,
    name: payload.room.auctionName,
    hostId: payload.host.userId,
    hostUsername: payload.host.userId,
    status:
      payload.status === "RUNNING"
        ? "LIVE"
        : payload.status === "PAUSED"
        ? "PAUSED"
        : payload.status === "COMPLETED" || payload.status === "CLOSED"
        ? "COMPLETED"
        : "LOBBY",
    settings,
    teams,
    participants: payload.teams.map((bt) => ({
      userId: bt.userId,
      username: bt.userId,
      teamId: bt.id,
      teamName: bt.name,
      isHost: bt.userId === payload.host.userId,
      connected: payload.connectedUsers.includes(bt.userId),
      ready: true,
    })),
    createdAt: new Date(payload.room.createdAt).toISOString(),
  };
}
