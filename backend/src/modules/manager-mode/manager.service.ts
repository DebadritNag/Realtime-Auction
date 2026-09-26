import {unseenOffers} from './notifications.js';
import {combinedImport,hydrateReleaseOrigins} from './free-agent-pool.js';
import {ensureSquad,squadAction,synchronizeSheets,recordMatch,playerSeasonStats} from './squad/squad.engine.js';
import {ensureSeasons,currentSeason,seasonFixtures,completeSeason,seasonAction,quoteSale} from './seasons/season.engine.js';
import {buyoutAction,synchronizeBuyouts} from './buyout/buyout.engine.js';
import {describeOffer} from './negotiation/offer-reaction.js';
import {SafeDialogueProvider,type NegotiationDialogueProvider} from './negotiation/dialogue.provider.js';
import {ensureNegotiations,negotiationAction,publicNegotiations,synchronizeWindow} from './negotiation/negotiation.engine.js';
import { assertRoom } from '../auction/squad.service.js';
import { createHash, randomUUID } from 'node:crypto';
import { requireThat } from '../../domain/errors.js';
import type { Room } from '../../domain/types.js';
import type { ManagerTournamentRepository, ManagerIdentityRepository } from './manager.repository.js';
import type { Tournament, TournamentState, ManagerPlayer } from './manager.types.js';
import { generateFixtures, standings } from './fixture.service.js';
import { importExternalCsv } from './external-import.service.js';
import { setupSchema, actionSchema, type ManagerAction } from './manager.schemas.js';
export class ManagerModeService {
    private listeners = new Set<(t: Tournament, event: string, audience?: string[]) => void>();
    constructor(readonly repository: ManagerTournamentRepository, private auction: (id: string) => Promise<Room | null>, private identities?: ManagerIdentityRepository, private prepareAuction?: (id:string,user:string)=>Promise<void>,private dialogue:NegotiationDialogueProvider=new SafeDialogueProvider(),private logger?:{info:(data:object,message:string)=>void}) { }
    subscribe(fn: (t: Tournament, event: string, audience?: string[]) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    private emit(t: Tournament, event: string, audience?: string[]) { for (const fn of this.listeners) {
        try {
            fn(t, event, audience);
        }
        catch { /* delivery failure must not undo a committed transaction */ }
    } }
    private notify(t: Tournament, type: string, message: string, users = [t.hostUserId], metadata:Record<string,string> = {}) { for (const userId of users)
        t.notifications.push({ id: randomUUID(), userId, type, title: type.replaceAll('_', ' '), message, read: false, createdAt: Date.now(), metadata: { tournamentId: t.id,...metadata } }); }
    view(t: Tournament, userId: string): TournamentState { hydrateReleaseOrigins(t); ensureSeasons(t);ensureSquad(t);synchronizeSheets(t); const team = t.teams.find(x => x.managerUserId === userId); requireThat(team, 'NOT_TOURNAMENT_MEMBER', 'You are not invited to this tournament.', 403); const terminalTrades=t.trades.filter(x=>x.fromTeamId===team.id||x.toTeamId===team.id).filter(x=>x.status!=='PENDING'),terminalBuyouts=(t.buyouts??[]).filter(x=>x.fromTeamId===team.id||x.toTeamId===team.id||x.status==='ACCEPTED').filter(x=>x.status!=='PENDING'),deals=t.transactions.filter(x=>x.type!=='AUCTION_PURCHASE');const tradeIds=new Set(terminalTrades.slice(-50).map(x=>x.id)),buyoutIds=new Set(terminalBuyouts.slice(-50).map(x=>x.id));
 const { startingSnapshot, receipts, negotiation, ...state } = structuredClone(t); return { ...state,historyCursors:{transactions:deals.length>100?deals.at(-100)!.id:null,trades:terminalTrades.length>50?terminalTrades.at(-50)!.id:null,buyouts:terminalBuyouts.length>50?terminalBuyouts.at(-50)!.id:null},teamSaleReturns:Object.fromEntries(t.teams.map(team=>[team.id,t.transactions.filter(x=>x.fromTeamId===team.id&&['RELEASE','BUYOUT'].includes(x.type)).reduce((sum,x)=>sum+x.amountUnits,0)])),transactions:[...t.transactions.filter(x=>x.type==='AUCTION_PURCHASE'),...deals.slice(-100)],unseenOffers:unseenOffers(t,userId,team.id),playerStats:playerSeasonStats(t),seasonFixturesById:Object.fromEntries(t.seasonData!.seasons.map(s=>[s.id,t.fixtures.filter(f=>f.seasonId===s.id)])),modeStatus:t.status==='ENDED'||t.status==='ARCHIVED'?'ENDED':'ACTIVE',fixtures:seasonFixtures(t),saleQuotes:Object.fromEntries(t.players.filter(p=>p.currentTeamId===team.id).map(p=>[p.id,quoteSale(t,p)])),buyouts:(state.buyouts??[]).filter(o=>o.fromTeamId===team.id||o.toTeamId===team.id||o.status==='ACCEPTED').filter(o=>o.status==='PENDING'||buyoutIds.has(o.id)), negotiation:publicNegotiations(t,team.id), audit:state.audit.slice(-100).map(a=>({...a,detail:'',userId:a.userId===userId?userId:''})), notificationUnread:t.notifications.filter(n=>n.userId===userId&&!n.read).length, notifications: state.notifications.filter(n => n.userId === userId).slice(-100), trades: state.trades.filter(x => x.fromTeamId === team.id || x.toTeamId === team.id).filter(x=>x.status==='PENDING'||tradeIds.has(x.id)), standings: currentSeason(t).status==='ACTIVE'?standings(t.teams,seasonFixtures(t)):currentSeason(t).finalStandings.length?currentSeason(t).finalStandings:standings(t.teams,seasonFixtures(t)), myTeamId: team.id, isHost: t.hostUserId === userId }; }
    async state(id: string, user: string) { const t = await this.repository.find(id); requireThat(t, 'TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404); return this.view(t, user); }
    async history(id:string,user:string,kind:'transactions'|'trades'|'buyouts'|'messages',before?:string,sessionId?:string){
 const t=await this.repository.find(id);requireThat(t,'TOURNAMENT_NOT_FOUND','Tournament not found.',404);const team=t.teams.find(x=>x.managerUserId===user);requireThat(team,'NOT_TOURNAMENT_MEMBER','Membership required.',403);
 if(kind==='messages')requireThat(t.negotiation?.sessions.some(s=>s.id===sessionId&&s.teamId===team.id),'NEGOTIATION_PERMISSION','You do not control this conversation.',403);
 const all=(kind==='transactions'?t.transactions.filter(x=>x.type!=='AUCTION_PURCHASE'):kind==='trades'?t.trades.filter(x=>x.fromTeamId===team.id||x.toTeamId===team.id):kind==='buyouts'?(t.buyouts??[]).filter(x=>x.fromTeamId===team.id||x.toTeamId===team.id||x.status==='ACCEPTED'):(t.negotiation?.messages??[]).filter(x=>x.sessionId===sessionId)).slice().reverse();
 const index=before?all.findIndex(x=>x.id===before):-1;requireThat(!before||index>=0,'INVALID_CURSOR','History cursor not found.',400);const rows=all.slice(index+1);return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49]!.id:null};
 }
    async notifications(id:string,user:string,before?:string){const t=await this.repository.find(id);requireThat(t,'TOURNAMENT_NOT_FOUND','Tournament not found.',404);requireThat(t.teams.some(x=>x.managerUserId===user),'NOT_TOURNAMENT_MEMBER','Membership required.',403);const all=t.notifications.filter(n=>n.userId===user).reverse();const index=before?all.findIndex(n=>n.id===before):-1;requireThat(!before||index>=0,'INVALID_CURSOR','Notification cursor not found.',400);const rows=all.slice(index+1);return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49]!.id:null};}
    async list(user: string) { if(this.repository.listSummaries)return this.repository.listSummaries(user);return (await this.repository.listForUser(user)).map(t => { const team = t.teams.find(x => x.managerUserId === user)!; return { id: t.id, name: t.name, sourceAuctionId: t.sourceAuctionId, sourceAuctionCode: t.sourceAuctionCode, status: t.status, teamName: team.name, invitation: team.invitation, unread: t.notifications.filter(n => n.userId === user && !n.read).length, sequence: t.sequence }; }); }
    async preview(id: string, user: string, csv = '') { const room = await this.auction(id); requireThat(room, 'ROOM_NOT_FOUND', 'Auction not found.', 404); requireThat(room.hostUserId === user, 'HOST_ONLY', 'Only the auction host may configure Manager Mode.', 403); requireThat(room.status === 'COMPLETED', 'AUCTION_NOT_COMPLETED', 'Complete the auction first.'); assertRoom(room); const usernames=await this.identities?.findUsernames(room.teams.map(t=>t.userId))??{}; return { room:{...room,teams:room.teams.map(t=>({...t,managerUsername:usernames[t.userId]??t.managerUsername}))}, existing: await this.repository.findByAuction(room.id), importReport: await combinedImport(csv, room.players.flatMap(p => [p.id,...(p.externalId?[p.externalId]:[])])) }; }
    async create(id: string, user: string, input: unknown) {
        const settings = setupSchema.parse(input);
        await this.preview(id,user,settings.csv);
        await this.prepareAuction?.(id,user);
        const { room, existing, importReport } = await this.preview(id, user, settings.csv);
        if (existing)
            return this.view(existing, user);
        requireThat(room.teams.length >= 2, 'NOT_ENOUGH_TEAMS', 'At least two teams are required.');
        requireThat(importReport.invalidRows.length === 0, 'INVALID_IMPORT', 'Correct invalid CSV rows before importing.', 400, { rows: importReport.invalidRows });
        const names = await this.identities?.findUsernames(room.teams.map(t => t.userId)) ?? {};
        const teams = room.teams.map(t => ({ id: t.id, sourceAuctionTeamId: t.id, name: t.name, logoUrl: t.logoUrl ?? '', logoEmoji: t.logoEmoji ?? '', managerUserId: t.userId, managerUsername: names[t.userId] ?? t.managerUsername ?? null, invitation: t.userId === user ? 'JOINED' as const : 'PENDING' as const, auctionBudgetUnits: t.startingBudgetUnits, auctionSpentUnits: t.spentUnits, auctionRemainingUnits: t.startingBudgetUnits - t.spentUnits, transferBudgetUnits: settings.startingBudgetUnits+(settings.addUnusedAuctionPurse?t.startingBudgetUnits-room.purchases.filter(p=>p.teamId===t.id).reduce((sum,p)=>sum+p.priceUnits,0):0) }));
        const players: ManagerPlayer[] = room.players.map(p => { const purchase = room.purchases.find(x => x.playerId === p.id); requireThat(p.status !== 'SOLD' || purchase, 'INVALID_AUCTION_SNAPSHOT', 'A sold player has no purchase record.'); return { id: p.id, name: p.name, overall: p.ovr, position: p.subPosition ?? p.position, category: p.position, secondaryPositions: p.secondaryPositions ?? '', club: p.club ?? '', nationality: p.nationality ?? '', imageUrl: p.photoUrl ?? '', ...(p.age !== undefined ? { age: p.age } : {}), stats: p.stats, tier: p.ratingTier ?? '', source: purchase ? 'AUCTION_SQUAD' : 'AUCTION_UNSOLD', currentTeamId: purchase?.teamId ?? null, ownershipStatus: purchase ? 'OWNED' : 'FREE_AGENT', availability: purchase ? 'SIGNED' : 'AVAILABLE', auctionPurchasePriceUnits: purchase?.priceUnits ?? null, acquisitionType: purchase ? 'AUCTION_PURCHASE' : null, acquisitionPriceUnits: purchase?.priceUnits ?? null, metadata: { potId: p.potId, externalId:p.externalId, originalAuctionStatus:p.status, ...(!purchase?{freeAgentReason:p.status==='UNSOLD'?'AUCTION_UNSOLD':'AUCTION_UNSEEN'}:{}) } }; });
        players.push(...importReport.players);
        this.logger?.info({event:'manager_pool_created',auctionSold:players.filter(p=>p.currentTeamId).length,auctionUnsold:players.filter(p=>p.metadata.freeAgentReason==='AUCTION_UNSOLD').length,auctionUnseen:players.filter(p=>p.metadata.freeAgentReason==='AUCTION_UNSEEN').length,externalRows:importReport.rowsDetected,externalDuplicatesSkipped:importReport.duplicates,totalFreeAgents:players.filter(p=>!p.currentTeamId).length,totalOwned:players.filter(p=>p.currentTeamId).length},'Manager Mode player pool');
        const now = Date.now();
        const t: Tournament = { id: randomUUID(), sourceAuctionId: room.id, sourceAuctionCode: room.code, sourceAuctionName: room.auctionName, name: settings.name, hostUserId: user, status: 'INVITING', format: settings.format, budgetMode: settings.addUnusedAuctionPurse?'CARRY_OVER':'EQUAL', startingBudgetUnits: settings.startingBudgetUnits, createdAt: now, updatedAt: now, sequence: 1, transferWindowOpen: false, teams, players, fixtures: [], trades: [], transactions: room.purchases.map(p => ({ id: randomUUID(), playerId: p.playerId, fromTeamId: null, toTeamId: p.teamId, type: 'AUCTION_PURCHASE', amountUnits: p.priceUnits, tradeId: null, at: p.at })), notifications: [], audit: [], startingSnapshot: structuredClone({ teams, players, auctionSequence: room.sequence, importReport }), receipts: {} };
        ensureSeasons(t);
        ensureNegotiations(t);
        this.notify(t, 'INVITATION', 'Your auction team has been invited to ' + t.name,t.teams.map(x=>x.managerUserId));
        const result = await this.repository.createUnique(t);
        if (result.created)
            this.emit(result.tournament, 'MANAGER_MODE_CREATED');
        return this.view(result.tournament, user);
    }
    async mutate(id: string, user: string, requestId: string, action: ManagerAction) {
        action = actionSchema.parse(action);
        let changed = false;
        let result = await this.repository.mutate(id, async (t) => {
            const team = t.teams.find(x => x.managerUserId === user);
            requireThat(team, 'NOT_TOURNAMENT_MEMBER', 'Tournament membership required.', 403);
            const key = user + ':' + requestId;
            const fingerprint = createHash('sha256').update(JSON.stringify(action)).digest('hex');
            if (t.receipts[key]) {
                requireThat(t.receipts[key].fingerprint === fingerprint, 'REQUEST_ID_REUSED', 'Request ID was already used for another action.', 409);
                return;
            }
            const host = () => requireThat(t.hostUserId === user, 'HOST_ONLY', 'Only the host may perform this action.', 403);
            if (action.type !== 'READ_NOTIFICATION' && action.type !== 'READ_ALL_NOTIFICATIONS' && action.type !== 'READ_OFFER')
                requireThat(t.status !== 'ARCHIVED'&&t.status!=='ENDED', 'MANAGER_MODE_ENDED', 'Manager Mode has ended and is read-only.',409);
            if (action.type !== 'INVITATION' && action.type !== 'READ_NOTIFICATION' && action.type !== 'READ_ALL_NOTIFICATIONS')
                requireThat(team.invitation === 'JOINED', 'INVITATION_NOT_ACCEPTED', 'Accept your invitation first.', 403);
            ensureSeasons(t);
            switch (action.type) {
 case 'SAVE_TEAM_SHEET':case 'RENEW_CONTRACT':squadAction(t,user,action);break;
 case 'END_CURRENT_SEASON':case 'START_NEXT_SEASON':case 'END_MANAGER_MODE':case 'SEASON_SETTINGS':case 'SELL_PLAYER':seasonAction(t,user,action);break;
 case 'BUYOUT':case 'BUYOUT_COUNTER':case 'BUYOUT_RESPONSE':{const offer=buyoutAction(t,user,action);const parties=t.teams.filter(x=>x.id===offer.fromTeamId||x.id===offer.toTeamId);const target=t.players.find(p=>p.id===offer.targetPlayerId)!;const event=action.type==='BUYOUT'?'BUYOUT_CREATED':action.type==='BUYOUT_COUNTER'?'BUYOUT_COUNTERED':'BUYOUT_'+offer.status;this.notify(t,event,target.name+' · ₹'+offer.cashAmountUnits/2+' Cr'+(offer.includedPlayerId?' + '+t.players.find(p=>p.id===offer.includedPlayerId)!.name:'')+' · '+offer.status.toLowerCase(),parties.map(x=>x.managerUserId),{entityType:'buyout',entityId:offer.id});if(offer.status==='ACCEPTED'){this.notify(t,'PLAYER_ACQUIRED','Acquired '+target.name,[t.teams.find(x=>x.id===offer.fromTeamId)!.managerUserId]);this.notify(t,'PLAYER_SOLD','Sold '+target.name,[t.teams.find(x=>x.id===offer.toTeamId)!.managerUserId]);}break;}
 case 'START_NEGOTIATION':case 'OFFER_FREE_AGENT':case 'END_NEGOTIATION':case 'CONFIRM_SIGNING':case 'TRANSFER_RULES':negotiationAction(t,user,action);break;
                case 'INVITATION':
                    requireThat(t.status === 'INVITING', 'INVITATIONS_CLOSED', 'Invitations are closed.');
                    requireThat(user !== t.hostUserId || action.accept, 'HOST_REQUIRED', 'The host cannot decline.');
                    team.invitation = action.accept ? 'JOINED' : 'DECLINED';
                    this.notify(t, 'MEMBER_UPDATED', team.name + (action.accept ? ' joined.' : ' declined.'));
                    break;
                case 'GENERATE_FIXTURES':
                    host();
                    requireThat(!seasonFixtures(t).length&&currentSeason(t).status==='ACTIVE', 'FIXTURES_EXIST', 'Fixtures have already been generated.', 409);
                    requireThat(t.teams.every(x => x.invitation === 'JOINED'), 'INVITATIONS_PENDING', 'All teams must accept before fixtures are generated.');
                    t.fixtures = generateFixtures(t.teams.map(x => x.id), t.format === 'DOUBLE_ROUND_ROBIN').map(f=>({...f,seasonId:currentSeason(t).id}));
                    t.status = 'ACTIVE';
                    break;
                case 'SCORE':
                case 'RESET_SCORE': {
                    host();
                    requireThat(t.status === 'ACTIVE', 'INVALID_STATE', 'Scores can only change during an active tournament.');
                    const f = t.fixtures.find(x => x.id === action.fixtureId);
                    requireThat(f, 'FIXTURE_NOT_FOUND', 'Fixture not found.', 404);
                    requireThat(currentSeason(t).status==='ACTIVE'&&f.seasonId===currentSeason(t).id,'HISTORICAL_SEASON','Closed seasons and historical results are read-only.',409);
                    const wasCompleted=f.status==='COMPLETED';
                    f.homeScore = action.type === 'SCORE' ? action.homeScore : null;
                    f.awayScore = action.type === 'SCORE' ? action.awayScore : null;
                    f.status = action.type === 'SCORE' ? 'COMPLETED' : 'SCHEDULED';
                    f.completedAt = action.type === 'SCORE' ? Date.now() : null;
                    if(action.type==='SCORE')recordMatch(t,f,action.scorers,Date.now(),!wasCompleted);else ensureSquad(t).lineups=ensureSquad(t).lineups.filter(x=>x.fixtureId!==f.id);
                    break;
                }
                case 'WINDOW':
                    host();
                    requireThat(t.status === 'ACTIVE'&&currentSeason(t).status==='ACTIVE', 'INVALID_STATE', 'Start an active season first.');
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
                    requireThat(action.status!=='ARCHIVED','CONFIRMATION_REQUIRED','Use End Manager Mode with explicit confirmation.');
                    if(action.status==='COMPLETED'){completeSeason(t);break;}
                    requireThat(currentSeason(t).status==='ACTIVE','SEASON_COMPLETED','Closed seasons cannot be reopened. Start the next season.');
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
                case 'READ_OFFER':for(const n of t.notifications)if(n.userId===user&&n.metadata.entityType===action.entityType&&n.metadata.entityId===action.entityId)n.read=true;break;
                case 'READ_ALL_NOTIFICATIONS': for(const n of t.notifications)if(n.userId===user)n.read=true;break;
                case 'READ_NOTIFICATION': {
                    const n = t.notifications.find(x => x.id === action.notificationId && x.userId === user);
                    requireThat(n, 'NOTIFICATION_NOT_FOUND', 'Notification not found.', 404);
                    n.read = true;
                    break;
                }
                case 'ANNOUNCE':
                    host();
                    this.notify(t, 'ANNOUNCEMENT', action.message,t.teams.map(x=>x.managerUserId));
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
            if(action.type==='SCORE'&&currentSeason(t).status==='ACTIVE'&&seasonFixtures(t).length&&seasonFixtures(t).every(f=>f.status==='COMPLETED'))completeSeason(t);
            ensureNegotiations(t);
            synchronizeSheets(t);
            synchronizeBuyouts(t);
            synchronizeWindow(t);
            t.receipts[key] = { fingerprint };
            t.sequence++;
            t.updatedAt = Date.now();
            t.audit.push({ id: randomUUID(), type: action.type, userId: user, at: t.updatedAt, detail: JSON.stringify(action) });
            if(action.type==='TRADE'||action.type==='TRADE_RESPONSE'){
 const tr=action.type==='TRADE'?t.trades.at(-1)!:t.trades.find(x=>x.id===action.tradeId)!;
 const parties=t.teams.filter(x=>x.id===tr.fromTeamId||x.id===tr.toTeamId);
 this.notify(t,action.type==='TRADE'?'TRADE_CREATED':'TRADE_UPDATED',team.name+' · '+t.players.find(p=>p.id===tr.offeredPlayerId)!.name+' / '+t.players.find(p=>p.id===tr.requestedPlayerId)!.name+' · '+tr.status,parties.map(x=>x.managerUserId),{entityType:'trade',entityId:tr.id});
 }else if(action.type==='SCORE'||action.type==='RESET_SCORE'){
 const f=t.fixtures.find(f=>f.id===action.fixtureId)!;this.notify(t,'RESULT_UPDATED','Your fixture result was updated.',t.teams.filter(x=>x.id===f.homeTeamId||x.id===f.awayTeamId).map(x=>x.managerUserId),{entityType:'fixture',entityId:f.id});
 }else if(action.type==='OFFER_FREE_AGENT'||action.type==='CONFIRM_SIGNING'){
 const session=t.negotiation!.sessions.find(s=>s.id===action.sessionId)!;const player=t.players.find(p=>p.id===session.playerId)!;
 this.notify(t,action.type==='CONFIRM_SIGNING'?'PLAYER_SIGNED':'FREE_AGENT_OFFER_UPDATED',player.name+' · '+session.status,[user],{entityType:'negotiation',entityId:session.id,playerId:player.id});
 for(const rival of t.negotiation!.sessions.filter(s=>s.playerId===player.id&&s.teamId!==team.id&&['ACTIVE','ACCEPTED','CLOSED_LOST_PLAYER'].includes(s.status)))this.notify(t,'NEGOTIATION_COMPETITION_UPDATED',player.name+(player.currentTeamId?' has signed for another club.':' has an updated offer from another club.'),[rival.managerUserId],{entityType:'negotiation',entityId:rival.id,playerId:player.id});
 }else if(['SAVE_TEAM_SHEET','RENEW_CONTRACT'].includes(action.type))this.notify(t,action.type,'Your squad has been updated.',[user]);
            changed = true;
        });
        if(changed&&action.type==='OFFER_FREE_AGENT'){
 this.emit(result,'MANAGER_MODE_UPDATED'); // Decision is committed and visible before any external dialogue request.
 const session=result.negotiation!.sessions.find(s=>s.id===action.sessionId)!;
 const message=result.negotiation!.messages.filter(m=>m.sessionId===session.id&&m.sender==='PLAYER').at(-1)!;
 const player=result.players.find(p=>p.id===session.playerId)!;
 const publicSession=publicNegotiations(result,session.teamId).sessions.find(s=>s.id===session.id)!;
 const reply=await new SafeDialogueProvider(this.dialogue).generateResponse({reaction:describeOffer(result,session),player:{name:player.name,position:player.position,overall:player.overall},personality:result.negotiation!.profiles.find(p=>p.playerId===player.id)!.archetype,emotion:message.emotion!,decision:message.decision!,counterUnits:session.lastCounterUnits,offerUnits:session.lastOfferUnits,club:{name:result.teams.find(t=>t.id===session.teamId)!.name},competition:publicSession.competition,fallback:message.message});
 if(reply.message!==message.message){try{result=await this.repository.mutate(id,draft=>{if(draft.status==='ENDED'||draft.status==='ARCHIVED')return;const target=draft.negotiation?.messages.find(m=>m.id===message.id);if(!target)return;target.message=reply.message;target.provider=reply.provider??'LLM';draft.sequence++;draft.updatedAt=Date.now();draft.audit.push({id:randomUUID(),type:'DIALOGUE_GENERATED',userId:user,at:Date.now(),detail:JSON.stringify({type:'DIALOGUE_GENERATED'})});});}catch{/* The committed deterministic template remains available. */}}
 }
 if (changed) {
 this.emit(result,'MANAGER_MODE_UPDATED');
 if(action.type==='END_CURRENT_SEASON'||(action.type==='SCORE'||action.type==='STATUS'&&action.status==='COMPLETED')&&currentSeason(result).status==='COMPLETED'){this.emit(result,'SEASON_COMPLETED');this.emit(result,'LEAGUE_SHIELD_AWARDED');this.emit(result,'SEASON_BONUSES_AWARDED');this.emit(result,'TEAM_BUDGET_UPDATED');}
 if(action.type==='START_NEXT_SEASON')this.emit(result,'NEXT_SEASON_STARTED');
 if(action.type==='END_MANAGER_MODE')this.emit(result,'MANAGER_MODE_ENDED');
 if(action.type==='SELL_PLAYER'){this.emit(result,'MANAGER_PLAYER_SOLD');this.emit(result,'PLAYER_RELEASED');this.emit(result,'FREE_AGENT_POOL_UPDATED');this.emit(result,'TEAM_BUDGET_UPDATED');}
 if(action.type==='BUYOUT'||action.type==='BUYOUT_COUNTER'||action.type==='BUYOUT_RESPONSE'){const offer=action.type==='BUYOUT_RESPONSE'?result.buyouts!.find(o=>o.id===action.buyoutId)!:result.buyouts!.at(-1)!;const audience=result.teams.filter(x=>x.id===offer.fromTeamId||x.id===offer.toTeamId).map(x=>x.managerUserId);this.emit(result,action.type==='BUYOUT'?'BUYOUT_CREATED':action.type==='BUYOUT_COUNTER'?'BUYOUT_COUNTERED':offer.status==='ACCEPTED'?'BUYOUT_ACCEPTED':offer.status==='REJECTED'?'BUYOUT_REJECTED':'BUYOUT_UPDATED',audience);if(offer.status==='ACCEPTED'){this.emit(result,'PLAYER_TRANSFERRED');this.emit(result,'TEAM_BUDGET_UPDATED');}}
 if(action.type==='START_NEGOTIATION')this.emit(result,'NEGOTIATION_STARTED',[user]);
 if(action.type==='OFFER_FREE_AGENT'||action.type==='END_NEGOTIATION')this.emit(result,'NEGOTIATION_UPDATED',[user]);
 if(action.type==='OFFER_FREE_AGENT'){this.emit(result,'FREE_AGENT_OFFER_UPDATED',[user]);if(result.negotiation!.sessions.find(s=>s.id===action.sessionId)?.status==='ACCEPTED')this.emit(result,'FREE_AGENT_ACCEPTED',[user]);}
 if(action.type==='CONFIRM_SIGNING'){this.emit(result,'FREE_AGENT_SIGNED');this.emit(result,'PLAYER_TRANSFERRED');const signed=result.negotiation!.sessions.find(s=>s.id===action.sessionId)!;this.emit(result,'FREE_AGENT_SIGNED_ELSEWHERE',result.negotiation!.sessions.filter(s=>s.playerId===signed.playerId&&s.id!==signed.id&&s.status==='CLOSED_LOST_PLAYER').map(s=>s.managerUserId));}
 if(action.type==='WINDOW')this.emit(result,action.open?'TRANSFER_WINDOW_OPENED':'TRANSFER_WINDOW_CLOSED');
 if(action.type==='TRADE'||action.type==='TRADE_RESPONSE'){const trade=action.type==='TRADE'?result.trades.at(-1):result.trades.find(t=>t.id===action.tradeId);const audience=result.teams.filter(t=>t.id===trade?.fromTeamId||t.id===trade?.toTeamId).map(t=>t.managerUserId);this.emit(result,action.type==='TRADE'?'TRADE_CREATED':'TRADE_UPDATED',audience);if(trade?.status==='ACCEPTED')this.emit(result,'PLAYER_TRANSFERRED');}
 }
        return this.view(result, user);
    }

    async delete(id: string, user: string): Promise<void> {
        const t = await this.repository.find(id);
        requireThat(t, 'TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
        requireThat(t.hostUserId === user, 'HOST_ONLY', 'Only the tournament host may delete this Manager Mode.', 403);
        // Log intent before deletion (the tournament row itself will be gone after)
        const hostUserId = t.hostUserId;
        const tournamentName = t.name;
        const teams = t.teams.map(x => x.managerUserId);
        await this.repository.delete(id);
        // Emit deletion event; emit with the original team data so hub can notify all members
        const tombstone = { ...t, status: 'ARCHIVED' as const };
        this.emit(tombstone, 'MANAGER_MODE_DELETED', teams);
        void hostUserId; void tournamentName;
    }
}
