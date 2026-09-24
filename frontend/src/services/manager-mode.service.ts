import { api } from './api';
import type { TournamentState, TournamentSummary, ImportReport } from '@/types/manager-mode';
import type { PlayerDTO } from '@/types/backend';
export type ManagerAction = {type:'START_NEGOTIATION';playerId:string}|{type:'OFFER_FREE_AGENT';sessionId:string;amountUnits:number}|{type:'END_NEGOTIATION';sessionId:string}|{type:'CONFIRM_SIGNING';sessionId:string}|{type:'TRANSFER_RULES';difficulty:'RELAXED'|'NORMAL'|'HARD';visibility:'PRIVATE'|'SEMI_TRANSPARENT'|'TRANSPARENT';walkAwayCooldownMs:number}| {
    type: 'INVITATION';
    accept: boolean;
} | {
    type: 'GENERATE_FIXTURES';
} | {
    type: 'SCORE';
    fixtureId: string;
    homeScore: number;
    awayScore: number;
} | {
    type: 'RESET_SCORE';
    fixtureId: string;
} | {
    type: 'WINDOW';
    open: boolean;
} | {
    type: 'STATUS';
    status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
} | {
    type: 'TRADE';
    offeredPlayerId: string;
    requestedPlayerId: string;
    parentTradeId?: string;
} | {
    type: 'TRADE_RESPONSE';
    tradeId: string;
    response: 'ACCEPT' | 'REJECT' | 'CANCEL';
} | {
    type: 'READ_NOTIFICATION';
    notificationId: string;
} | {
    type: 'ANNOUNCE';
    message: string;
} | {
    type: 'RESEND_INVITATIONS';
};
export interface SetupPreview {
    auctionId: string;
    name: string;
    existingId: string | null;
    teams: {
        id: string;
        name: string;
        logoUrl?: string;
        logoEmoji?: string;
        managerUsername?: string;
        playerIds: string[];
        startingBudgetUnits: number;
        spentUnits: number;
    }[];
    players: (Omit<PlayerDTO, 'basePriceCr' | 'position'> & {basePriceUnits:number;position:PlayerDTO['position']|'ATT'})[];
    purchases: {
        playerId: string;
        teamId: string;
        priceUnits: number;
    }[];
    importReport: ImportReport;
}
const base = '/manager-mode';
export const managerService = {
    list: () => api.get<TournamentSummary[]>(base), state: (id: string) => api.get<TournamentState>(base + '/' + encodeURIComponent(id)),
    preview: (id: string) => api.get<SetupPreview>(base + '/from-auction/' + encodeURIComponent(id)),
    importPreview: (id: string, csv: string) => api.post<ImportReport>(base + '/from-auction/' + encodeURIComponent(id) + '/preview', { csv }),
    create: (id: string, input: {
        name: string;
        startingBudgetUnits: number;
        csv: string;
        format: string;
    }) => api.post<TournamentState>(base + '/from-auction/' + encodeURIComponent(id), input),
    action: (id: string, action: ManagerAction, requestId = crypto.randomUUID()) => api.post<TournamentState>(base + '/' + encodeURIComponent(id) + '/actions', { requestId, action }),
    delete: (id: string) => api.delete<void>(base + '/' + encodeURIComponent(id)),
};
