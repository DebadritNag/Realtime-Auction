import type {SquadData,PlayerSeasonStats} from './manager-squad';
import type {SeasonData,SaleQuote} from './manager-season';
import type {BuyoutOffer} from './manager-buyout';
import type {NegotiationData,NegotiationView} from './manager-negotiation';
export type TournamentStatus = 'INVITING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | 'ENDED';
export type PlayerSource = 'AUCTION_SQUAD' | 'AUCTION_UNSOLD' | 'EXTERNAL_POOL';
export interface ManagerPlayer {
    id: string;
    name: string;
    overall: number;
    position: string;
    category: string;
    secondaryPositions: string;
    club: string;
    nationality: string;
    imageUrl: string;
    age?: number;
    stats: Record<string, number>;
    tier: string;
    source: PlayerSource;
    currentTeamId: string | null;
    ownershipStatus: 'OWNED' | 'FREE_AGENT';
    availability: 'AVAILABLE' | 'NEGOTIATING' | 'SIGNED';
    auctionPurchasePriceUnits: number | null;
    acquisitionType: 'AUCTION_PURCHASE' | 'FREE_AGENT_SIGNING' | 'TRADE' | 'BUYOUT' | null;
    acquisitionPriceUnits: number | null;
    metadata: Record<string, unknown>;
}
export interface ManagerTeam {
    id: string;
    sourceAuctionTeamId: string;
    name: string;
    logoUrl: string;
    logoEmoji: string;
    managerUserId: string;
    managerUsername: string | null;
    invitation: 'PENDING' | 'JOINED' | 'DECLINED';
    auctionBudgetUnits: number;
    auctionSpentUnits: number;
    auctionRemainingUnits: number;
    transferBudgetUnits: number;
}
export interface Fixture {
    seasonId?: string;
    id: string;
    matchday: number;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
    scheduledAt: number | null;
    completedAt: number | null;
}
export interface Standing {
    teamId: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
}
export interface Trade {
    id: string;
    fromTeamId: string;
    toTeamId: string;
    offeredPlayerId: string;
    requestedPlayerId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'CANCELLED' | 'EXPIRED';
    parentTradeId: string | null;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}
export interface TransferTransaction {
    id: string;
    playerId: string;
    fromTeamId: string | null;
    toTeamId: string | null;
    type: 'AUCTION_PURCHASE' | 'TRADE' | 'FREE_AGENT_SIGNING' | 'BUYOUT' | 'RELEASE';
    buyoutId?: string | null;
    amountUnits: number;
    tradeId: string | null;
    at: number;
}
export interface ManagerNotification {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: number;
    metadata: Record<string, string>;
}
export interface ManagerAudit {
    id: string;
    type: string;
    userId: string;
    at: number;
    detail: string;
}
export interface Tournament {
    squadData?:SquadData;
    seasonData?: SeasonData;
    buyouts?: BuyoutOffer[];
    negotiation?: NegotiationData;
    id: string;
    sourceAuctionId: string;
    sourceAuctionCode: string;
    sourceAuctionName: string;
    name: string;
    hostUserId: string;
    status: TournamentStatus;
    format: 'SINGLE_ROUND_ROBIN' | 'DOUBLE_ROUND_ROBIN';
    budgetMode: 'EQUAL' | 'CARRY_OVER';
    startingBudgetUnits: number;
    createdAt: number;
    updatedAt: number;
    sequence: number;
    transferWindowOpen: boolean;
    teams: ManagerTeam[];
    players: ManagerPlayer[];
    fixtures: Fixture[];
    trades: Trade[];
    transactions: TransferTransaction[];
    notifications: ManagerNotification[];
    audit: ManagerAudit[];
    startingSnapshot: {
        teams: ManagerTeam[];
        players: ManagerPlayer[];
        auctionSequence: number;
        importReport?: ImportReport;
    };
    receipts: Record<string, {
        fingerprint: string;
    }>;
}
export type TournamentState = Omit<Tournament, 'startingSnapshot' | 'receipts' | 'negotiation'> & {
    negotiation: NegotiationView;
    playerStats?:Record<string,PlayerSeasonStats>;
    saleQuotes?: Record<string,SaleQuote>;
    seasonFixturesById?: Record<string,Fixture[]>;
    modeStatus?: "ACTIVE" | "ENDED";
    standings: Standing[];
    myTeamId: string;
    isHost: boolean;
};
export interface TournamentSummary {
    id: string;
    name: string;
    sourceAuctionId: string;
    sourceAuctionCode: string;
    status: TournamentStatus;
    teamName: string;
    invitation: ManagerTeam['invitation'];
    unread: number;
    sequence: number;
}
export interface ImportReport {
    auditRows?: {row:number;externalId:string|null;name:string|null;status:"VALID"|"INVALID"|"DUPLICATE";reason:string|null}[];
    rowsDetected: number;
    validPlayers: number;
    duplicates: number;
    invalidRows: {
        row: number;
        reason: string;
    }[];
    players: ManagerPlayer[];
}
/** Negotiation service boundary. Implemented by ManagerModeService actions. */
export interface FreeAgentNegotiationService {
    start(tournamentId: string, userId: string, playerId: string): Promise<{
        sessionId: string;
    }>;
}
