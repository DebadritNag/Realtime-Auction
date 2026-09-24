import { assertRoom } from '../auction/squad.service.js';
import { randomUUID } from 'node:crypto';
import { requireThat } from '../../domain/errors.js';
import type { Room } from '../../domain/types.js';
import type { ManagerTournamentRepository, ManagerIdentityRepository } from './manager.repository.js';
import type { Tournament, TournamentState, ManagerPlayer } from './manager.types.js';
import { generateFixtures, standings } from './fixture.service.js';
import { importExternalCsv } from './external-import.service.js';
import { setupSchema, actionSchema, type ManagerAction } from './manager.schemas.js';
export class ManagerModeService {
    private listeners = new Set<(t: Tournament, event: string) => void>();
    constructor(readonly repository: ManagerTournamentRepository, private auction: (id: string) => Promise<Room | null>, private identities?: ManagerIdentityRepository) { }
    subscribe(fn: (t: Tournament, event: string) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    private emit(t: Tournament, event: string) { for (const fn of this.listeners) {
        try {
            fn(t, event);
        }
        catch { /* delivery failure must not undo a committed transaction */ }
    } }
    private notify(t: Tournament, type: string, message: string, users = t.teams.map(x => x.managerUserId)) { for (const userId of users)
        t.notifications.push({ id: randomUUID(), userId, type, title: type.replaceAll('_', ' '), message, read: false, createdAt: Date.now(), metadata: { tournamentId: t.id } }); }
    view(t: Tournament, userId: string): TournamentState { const team = t.teams.find(x => x.managerUserId === userId); requireThat(team, 'NOT_TOURNAMENT_MEMBER', 'You are not invited to this tournament.', 403); const { startingSnapshot, receipts, ...state } = structuredClone(t); return { ...state, notifications: state.notifications.filter(n => n.userId === userId), trades: state.trades.filter(x => x.fromTeamId === team.id || x.toTeamId === team.id || t.hostUserId === userId), standings: standings(t.teams, t.fixtures), myTeamId: team.id, isHost: t.hostUserId === userId }; }
    async state(id: string, user: string) { const t = await this.repository.find(id); requireThat(t, 'TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404); return this.view(t, user); }
    async list(user: string) { return (await this.repository.listForUser(user)).map(t => { const team = t.teams.find(x => x.managerUserId === user)!; return { id: t.id, name: t.name, sourceAuctionId: t.sourceAuctionId, sourceAuctionCode: t.sourceAuctionCode, status: t.status, teamName: team.name, invitation: team.invitation, unread: t.notifications.filter(n => n.userId === user && !n.read).length, sequence: t.sequence }; }); }
    async preview(id: string, user: string, csv = '') { const room = await this.auction(id); requireThat(room, 'ROOM_NOT_FOUND', 'Auction not found.', 404); requireThat(room.hostUserId === user, 'HOST_ONLY', 'Only the auction host may configure Manager Mode.', 403); requireThat(room.status === 'COMPLETED', 'AUCTION_NOT_COMPLETED', 'Complete the auction first.'); assertRoom(room); const usernames=await this.identities?.findUsernames(room.teams.map(t=>t.userId))??{}; return { room:{...room,teams:room.teams.map(t=>({...t,managerUsername:usernames[t.userId]??t.managerUsername}))}, existing: await this.repository.findByAuction(room.id), importReport: importExternalCsv(csv, room.players.map(p => p.id)) }; }
    async create(id: string, user: string, input: unknown) {
        const settings = setupSchema.parse(input);
        const { room, existing, importReport } = await this.preview(id, user, settings.csv);
        if (existing)
            return this.view(existing, user);
        requireThat(room.teams.length >= 2, 'NOT_ENOUGH_TEAMS', 'At least two teams are required.');
        requireThat(importReport.invalidRows.length === 0, 'INVALID_IMPORT', 'Correct invalid CSV rows before importing.', 400, { rows: importReport.invalidRows });
        const names = await this.identities?.findUsernames(room.teams.map(t => t.userId)) ?? {};
        const teams = room.teams.map(t => ({ id: t.id, sourceAuctionTeamId: t.id, name: t.name, logoUrl: t.logoUrl ?? '', logoEmoji: t.logoEmoji ?? '', managerUserId: t.userId, managerUsername: names[t.userId] ?? t.managerUsername ?? null, invitation: t.userId === user ? 'JOINED' as const : 'PENDING' as const, auctionBudgetUnits: t.startingBudgetUnits, auctionSpentUnits: t.spentUnits, auctionRemainingUnits: t.startingBudgetUnits - t.spentUnits, transferBudgetUnits: settings.startingBudgetUnits }));
        const players: ManagerPlayer[] = room.players.filter(p => p.status === 'SOLD' || p.status === 'UNSOLD').map(p => { const purchase = room.purchases.find(x => x.playerId === p.id); requireThat(p.status !== 'SOLD' || purchase, 'INVALID_AUCTION_SNAPSHOT', 'A sold player has no purchase record.'); return { id: p.id, name: p.name, overall: p.ovr, position: p.subPosition ?? p.position, category: p.position, secondaryPositions: p.secondaryPositions ?? '', club: p.club ?? '', nationality: p.nationality ?? '', imageUrl: p.photoUrl ?? '', ...(p.age !== undefined ? { age: p.age } : {}), stats: p.stats, tier: p.ratingTier ?? '', source: purchase ? 'AUCTION_SQUAD' : 'AUCTION_UNSOLD', currentTeamId: purchase?.teamId ?? null, ownershipStatus: purchase ? 'OWNED' : 'FREE_AGENT', availability: purchase ? 'SIGNED' : 'AVAILABLE', auctionPurchasePriceUnits: purchase?.priceUnits ?? null, acquisitionType: purchase ? 'AUCTION_PURCHASE' : null, acquisitionPriceUnits: purchase?.priceUnits ?? null, metadata: { potId: p.potId } }; });
        players.push(...importReport.players);
        const now = Date.now();
        const t: Tournament = { id: randomUUID(), sourceAuctionId: room.id, sourceAuctionCode: room.code, sourceAuctionName: room.auctionName, name: settings.name, hostUserId: user, status: 'INVITING', format: settings.format, budgetMode: 'EQUAL', startingBudgetUnits: settings.startingBudgetUnits, createdAt: now, updatedAt: now, sequence: 1, transferWindowOpen: false, teams, players, fixtures: [], trades: [], transactions: room.purchases.map(p => ({ id: randomUUID(), playerId: p.playerId, fromTeamId: null, toTeamId: p.teamId, type: 'AUCTION_PURCHASE', amountUnits: p.priceUnits, tradeId: null, at: p.at })), notifications: [], audit: [], startingSnapshot: structuredClone({ teams, players, auctionSequence: room.sequence }), receipts: {} };
        this.notify(t, 'INVITATION', 'Your auction team has been invited to ' + t.name);
        const result = await this.repository.createUnique(t);
        if (result.created)
            this.emit(result.tournament, 'MANAGER_MODE_CREATED');
        return this.view(result.tournament, user);
    }
    async mutate(id: string, user: string, requestId: string, action: ManagerAction) {
        action = actionSchema.parse(action);
        let changed = false;
        const result = await this.repository.mutate(id, async (t) => {
            const team = t.teams.find(x => x.managerUserId === user);
            requireThat(team, 'NOT_TOURNAMENT_MEMBER', 'Tournament membership required.', 403);
            const key = user + ':' + requestId;
            const fingerprint = JSON.stringify(action);
            if (t.receipts[key]) {
                requireThat(t.receipts[key].fingerprint === fingerprint, 'REQUEST_ID_REUSED', 'Request ID was already used for another action.', 409);
                return;
            }
            const host = () => requireThat(t.hostUserId === user, 'HOST_ONLY', 'Only the host may perform this action.', 403);
            if (action.type !== 'READ_NOTIFICATION')
                requireThat(t.status !== 'ARCHIVED', 'TOURNAMENT_ARCHIVED', 'Tournament is archived.');
            if (action.type !== 'INVITATION' && action.type !== 'READ_NOTIFICATION')
                requireThat(team.invitation === 'JOINED', 'INVITATION_NOT_ACCEPTED', 'Accept your invitation first.', 403);
            switch (action.type) {
                case 'INVITATION':
                    requireThat(t.status === 'INVITING', 'INVITATIONS_CLOSED', 'Invitations are closed.');
                    requireThat(user !== t.hostUserId || action.accept, 'HOST_REQUIRED', 'The host cannot decline.');
                    team.invitation = action.accept ? 'JOINED' : 'DECLINED';
                    this.notify(t, 'MEMBER_UPDATED', team.name + (action.accept ? ' joined.' : ' declined.'));
                    break;
                case 'GENERATE_FIXTURES':
                    host();
                    requireThat(!t.fixtures.length, 'FIXTURES_EXIST', 'Fixtures have already been generated.', 409);
                    requireThat(t.teams.every(x => x.invitation === 'JOINED'), 'INVITATIONS_PENDING', 'All teams must accept before fixtures are generated.');
                    t.fixtures = generateFixtures(t.teams.map(x => x.id), t.format === 'DOUBLE_ROUND_ROBIN');
                    t.status = 'ACTIVE';
                    break;
                case 'SCORE':
                case 'RESET_SCORE': {
                    host();
                    requireThat(t.status === 'ACTIVE', 'INVALID_STATE', 'Scores can only change during an active tournament.');
                    const f = t.fixtures.find(x => x.id === action.fixtureId);
                    requireThat(f, 'FIXTURE_NOT_FOUND', 'Fixture not found.', 404);
                    f.homeScore = action.type === 'SCORE' ? action.homeScore : null;
                    f.awayScore = action.type === 'SCORE' ? action.awayScore : null;
                    f.status = action.type === 'SCORE' ? 'COMPLETED' : 'SCHEDULED';
                    f.completedAt = action.type === 'SCORE' ? Date.now() : null;
                    break;
                }
                case 'WINDOW':
                    host();
                    requireThat(t.status === 'ACTIVE', 'INVALID_STATE', 'Start the tournament first.');
                    t.transferWindowOpen = action.open;
                    if (!action.open)
                        for (const trade of t.trades)
                            if (trade.status === 'PENDING') {
                                trade.status = 'EXPIRED';
                                trade.updatedAt = Date.now();
                            }
                    break;
                case 'STATUS':
                    host();
                    if (action.status === 'COMPLETED')
                        requireThat(t.fixtures.length && t.fixtures.every(f => f.status === 'COMPLETED'), 'MATCHES_PENDING', 'Complete all fixtures first.');
                    if (action.status === 'ACTIVE')
                        requireThat(t.fixtures.length && t.status !== 'ARCHIVED', 'INVALID_STATE', 'Generate fixtures first.');
                    t.status = action.status;
                    if (action.status !== 'ACTIVE') {
                        t.transferWindowOpen = false;
                        for (const tr of t.trades)
                            if (tr.status === 'PENDING')
                                tr.status = 'EXPIRED';
                    }
                    break;
                case 'TRADE': {
                    requireThat(t.status === 'ACTIVE' && t.transferWindowOpen, 'TRANSFER_WINDOW_CLOSED', 'The transfer window is closed.');
                    const offered = t.players.find(p => p.id === action.offeredPlayerId), requested = t.players.find(p => p.id === action.requestedPlayerId);
                    requireThat(offered?.currentTeamId === team.id && requested?.currentTeamId && requested.currentTeamId !== team.id, 'INVALID_OWNERSHIP', 'Choose one of your players and one opponent player.');
                    requireThat(t.teams.some(x => x.id === requested.currentTeamId && x.invitation === 'JOINED'), 'INVALID_RECIPIENT', 'Recipient has not joined.');
                    if (action.parentTradeId) {
                        const parent = t.trades.find(x => x.id === action.parentTradeId);
                        requireThat(parent?.status === 'PENDING' && parent.toTeamId === team.id && parent.fromTeamId === requested.currentTeamId, 'INVALID_COUNTER', 'Only the recipient can counter a pending offer.');
                        parent.status = 'COUNTERED';
                        parent.updatedAt = Date.now();
                    }
                    requireThat(!t.trades.some(x => x.status === 'PENDING' && x.offeredPlayerId === offered.id && x.requestedPlayerId === requested.id), 'DUPLICATE_TRADE', 'This offer is already pending.');
                    t.trades.push({ id: randomUUID(), fromTeamId: team.id, toTeamId: requested.currentTeamId, offeredPlayerId: offered.id, requestedPlayerId: requested.id, status: 'PENDING', parentTradeId: action.parentTradeId ?? null, createdBy: user, createdAt: Date.now(), updatedAt: Date.now() });
                    break;
                }
                case 'TRADE_RESPONSE': {
                    const tr = t.trades.find(x => x.id === action.tradeId);
                    requireThat(tr?.status === 'PENDING', 'TRADE_NOT_PENDING', 'Trade is no longer pending.', 409);
                    requireThat(action.response === 'CANCEL' ? tr.fromTeamId === team.id : tr.toTeamId === team.id, 'TRADE_PERMISSION', 'You cannot respond to this trade.', 403);
                    if (action.response === 'ACCEPT') {
                        requireThat(t.status === 'ACTIVE' && t.transferWindowOpen, 'TRANSFER_WINDOW_CLOSED', 'Transfer window is closed.');
                        const a = t.players.find(p => p.id === tr.offeredPlayerId), b = t.players.find(p => p.id === tr.requestedPlayerId);
                        requireThat(a?.currentTeamId === tr.fromTeamId && b?.currentTeamId === tr.toTeamId, 'STALE_OWNERSHIP', 'Player ownership changed.', 409);
                        for (const [p, target] of [[a, tr.toTeamId], [b, tr.fromTeamId]] as const) {
                            t.transactions.push({ id: randomUUID(), playerId: p.id, fromTeamId: p.currentTeamId, toTeamId: target, type: 'TRADE', amountUnits: 0, tradeId: tr.id, at: Date.now() });
                            p.currentTeamId = target;
                            p.acquisitionType = 'TRADE';
                            p.acquisitionPriceUnits = 0;
                        }
                        for (const other of t.trades)
                            if (other.id !== tr.id && other.status === 'PENDING' && [other.offeredPlayerId, other.requestedPlayerId].some(pid => pid === a.id || pid === b.id))
                                other.status = 'EXPIRED';
                    }
                    tr.status = action.response === 'ACCEPT' ? 'ACCEPTED' : action.response === 'REJECT' ? 'REJECTED' : 'CANCELLED';
                    tr.updatedAt = Date.now();
                    break;
                }
                case 'READ_NOTIFICATION': {
                    const n = t.notifications.find(x => x.id === action.notificationId && x.userId === user);
                    requireThat(n, 'NOTIFICATION_NOT_FOUND', 'Notification not found.', 404);
                    n.read = true;
                    break;
                }
                case 'ANNOUNCE':
                    host();
                    this.notify(t, 'ANNOUNCEMENT', action.message);
                    break;
                case 'RESEND_INVITATIONS':
                    host();
                    requireThat(t.status === 'INVITING', 'INVITATIONS_CLOSED', 'Invitations are closed.');
                    for (const x of t.teams)
                        if (x.invitation !== 'JOINED')
                            x.invitation = 'PENDING';
                    this.notify(t, 'INVITATION', 'Please respond to your tournament invitation.', t.teams.filter(x => x.invitation === 'PENDING').map(x => x.managerUserId));
                    break;
            }
            t.receipts[key] = { fingerprint };
            t.sequence++;
            t.updatedAt = Date.now();
            t.audit.push({ id: randomUUID(), type: action.type, userId: user, at: t.updatedAt, detail: JSON.stringify(action) });
            if (!['READ_NOTIFICATION', 'ANNOUNCE', 'RESEND_INVITATIONS', 'INVITATION'].includes(action.type))
                this.notify(t, action.type, 'Tournament updated: ' + action.type.replaceAll('_', ' ').toLowerCase());
            changed = true;
        });
        if (changed)
            this.emit(result, 'MANAGER_MODE_UPDATED');
        return this.view(result, user);
    }
}
