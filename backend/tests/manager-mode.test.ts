import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ManagerModeService } from '../src/modules/manager-mode/manager.service.js';
import { MemoryManagerRepository } from '../src/modules/manager-mode/manager.repository.js';
import { generateFixtures } from '../src/modules/manager-mode/fixture.service.js';
import { importExternalCsv } from '../src/modules/manager-mode/external-import.service.js';
import { mutationSchema } from '../src/modules/manager-mode/manager.schemas.js';
import type { Room } from '../src/domain/types.js';
import { settingsSchema } from '../src/schemas/settings.js';
export function source(): Room { const teams = Array.from({ length: 8 }, (_, i) => ({ id: 'team' + i, userId: 'user' + i, name: 'Team ' + i, startingBudgetUnits: 400, spentUnits: 48, playerIds: Array.from({ length: 24 }, (_, j) => 'p' + (i * 24 + j)) })); return { id: 'auction-id', code: 'ABC234', hostUserId: 'user0', auctionName: 'Acceptance League', status: 'COMPLETED', createdAt: 1, settings: settingsSchema.parse({ numberOfTeams: 8, startingBudgetCr: 200, maxSquadSize: 24 }), teams, players: Array.from({ length: 212 }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i, position: 'MID', subPosition: 'CM', ovr: 80, stats: { passing: 80 }, basePriceUnits: 2, potId: 'gold', status: i < 192 ? 'SOLD' : 'UNSOLD', round: 1 })), purchases: teams.flatMap(t => t.playerIds.map(playerId => ({ id: randomUUID(), playerId, teamId: t.id, priceUnits: 2, bidCount: 1, at: 1, durationMs: 1000 }))), active: null, playerQueue: [], bids: [], sequence: 50, nextPlayerAt: null, receipts: {} }; }
const csv = 'player_id,name,overall,position\n' + Array.from({ length: 50 }, (_, i) => `external${i},External ${i},82,CB`).join('\n');
async function setup(active = false) { const room = source(), repo = new MemoryManagerRepository(), service = new ManagerModeService(repo, async () => room); const state = await service.create(room.id, 'user0', { addUnusedAuctionPurse:false, name: 'League', csv }); const act = (user: string, action: Parameters<typeof service.mutate>[3], id = randomUUID()) => service.mutate(state.id, user, id, action); if (active) {
    for (let i = 1; i < 8; i++)
        await act('user' + i, { type: 'INVITATION', accept: true });
    await act('user0', { type: 'GENERATE_FIXTURES' });
} return { room, repo, service, state, act }; }
it('imports exact squads and default plus optional free agents; snapshots independently and creates once', async () => { const f = await setup(); expect(f.state.players.filter(p => p.currentTeamId)).toHaveLength(192); expect(f.state.players.filter(p => !p.currentTeamId)).toHaveLength(427); expect(f.state.teams.every(t => t.transferBudgetUnits === 200)).toBe(true); expect((await f.service.create(f.room.id, 'user0', { addUnusedAuctionPurse:false, name: 'Another' })).id).toBe(f.state.id); f.room.players[0]!.name = 'Changed'; expect((await f.service.state(f.state.id, 'user0')).players[0]!.name).toBe('Player 0'); expect(f.room.sequence).toBe(50); });
it('generates unique 28 fixtures / seven days / four matches, odd byes and doubles', async () => { const f = await setup(true), s = await f.service.state(f.state.id, 'user0'); expect(s.fixtures).toHaveLength(28); expect(new Set(s.fixtures.map(x => [x.homeTeamId, x.awayTeamId].sort().join(':'))).size).toBe(28); for (let d = 1; d <= 7; d++) {
    const rows = s.fixtures.filter(x => x.matchday === d);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.flatMap(x => [x.homeTeamId, x.awayTeamId])).size).toBe(8);
} await expect(f.act('user0', { type: 'GENERATE_FIXTURES' })).rejects.toMatchObject({ code: 'FIXTURES_EXIST' }); const odd = generateFixtures(['a', 'b', 'c', 'd', 'e']); expect(odd).toHaveLength(10); for (const id of ['a', 'b', 'c', 'd', 'e'])
    expect(odd.filter(x => x.homeTeamId === id || x.awayTeamId === id)).toHaveLength(4); expect(generateFixtures(['a', 'b', 'c'], true)).toHaveLength(6); });
it('corrects 3–1 to 2–2, resets standings, rejects unauthorized and invalid scores', async () => { const f = await setup(true), fixture = (await f.service.state(f.state.id, 'user0')).fixtures[0]!; await expect(f.act('user1', { type: 'SCORE', fixtureId: fixture.id, homeScore: 3, awayScore: 1 })).rejects.toMatchObject({ code: 'HOST_ONLY' }); await f.act('user0', { type: 'SCORE', fixtureId: fixture.id, homeScore: 3, awayScore: 1 }); const corrected = await f.act('user0', { type: 'SCORE', fixtureId: fixture.id, homeScore: 2, awayScore: 2 }); expect(corrected.standings.find(x => x.teamId === fixture.homeTeamId)).toMatchObject({ played: 1, won: 0, drawn: 1, points: 1, gf: 2, ga: 2 }); expect((await f.act('user0', { type: 'RESET_SCORE', fixtureId: fixture.id })).standings.every(x => x.played === 0)).toBe(true); for (const score of [-1, 1.5, Infinity])
    expect(mutationSchema.safeParse({ requestId: randomUUID(), action: { type: 'SCORE', fixtureId: fixture.id, homeScore: score, awayScore: 0 } }).success).toBe(false); });
it('atomically accepts concurrent swaps once, preserves money/history and deduplicates retries', async () => { const f = await setup(true); await f.act('user0', { type: 'WINDOW', open: true }); const p = await f.act('user0', { type: 'TRADE', offeredPlayerId: 'p0', requestedPlayerId: 'p24' }); const q = await f.act('user0', { type: 'TRADE', offeredPlayerId: 'p0', requestedPlayerId: 'p48' }); const request = randomUUID(); const results = await Promise.allSettled([f.act('user1', { type: 'TRADE_RESPONSE', tradeId: p.trades[0]!.id, response: 'ACCEPT' }, request), f.act('user2', { type: 'TRADE_RESPONSE', tradeId: q.trades[1]!.id, response: 'ACCEPT' })]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); const s = (await f.repo.find(f.state.id))!; expect(s.players.find(p => p.id === 'p0')?.currentTeamId).toBe('team1'); expect(s.players.find(p => p.id === 'p24')?.currentTeamId).toBe('team0'); expect(s.transactions.filter(t => t.type === 'TRADE')).toHaveLength(2); expect(s.teams.every(t => t.transferBudgetUnits === 200)).toBe(true); expect(f.room.teams[0]!.playerIds).toContain('p0'); expect((await f.act('user1', { type: 'TRADE_RESPONSE', tradeId: p.trades[0]!.id, response: 'ACCEPT' }, request)).sequence).toBe(s.sequence); expect(s.trades[1]!.status).toBe('EXPIRED'); });
it('enforces windows, ownership and recipient; supports counter/reject/cancel and private notifications', async () => { const f = await setup(true); await expect(f.act('user0', { type: 'TRADE', offeredPlayerId: 'p0', requestedPlayerId: 'p24' })).rejects.toMatchObject({ code: 'TRANSFER_WINDOW_CLOSED' }); await f.act('user0', { type: 'WINDOW', open: true }); await expect(f.act('user0', { type: 'TRADE', offeredPlayerId: 'p24', requestedPlayerId: 'p48' })).rejects.toMatchObject({ code: 'INVALID_OWNERSHIP' }); const a = await f.act('user0', { type: 'TRADE', offeredPlayerId: 'p0', requestedPlayerId: 'p24' }); await expect(f.act('user2', { type: 'TRADE_RESPONSE', tradeId: a.trades[0]!.id, response: 'ACCEPT' })).rejects.toMatchObject({ code: 'TRADE_PERMISSION' }); const b = await f.act('user1', { type: 'TRADE', offeredPlayerId: 'p25', requestedPlayerId: 'p1', parentTradeId: a.trades[0]!.id }); expect(b.trades[0]!.status).toBe('COUNTERED'); await f.act('user0', { type: 'TRADE_RESPONSE', tradeId: b.trades[1]!.id, response: 'REJECT' }); const c = await f.act('user1', { type: 'TRADE', offeredPlayerId: 'p25', requestedPlayerId: 'p1' }); await f.act('user1', { type: 'TRADE_RESPONSE', tradeId: c.trades.at(-1)!.id, response: 'CANCEL' }); expect(c.notifications.every(n => n.userId === 'user1')).toBe(true); await expect(f.service.state(f.state.id, 'outsider')).rejects.toMatchObject({ code: 'NOT_TOURNAMENT_MEMBER' }); });
it('validates CSV and rolls back failed writes', async () => { const r = importExternalCsv('player_id,name,overall,position\np0,Existing,80,CM\nx,New,82,CB\nx,Again,82,CB\nbad,Invalid,80,DEF\n,Missing,80,ST', ['p0']); expect(r.validPlayers).toBe(1); expect(r.duplicates).toBe(2); expect(r.invalidRows).toHaveLength(2); const f = await setup(); await expect(f.repo.mutate(f.state.id, t => { t.players = []; throw Error('write failed'); })).rejects.toThrow(); expect((await f.repo.find(f.state.id))?.players).toHaveLength(619); });
it('requires invitations, completed auction, host creation, and completed fixtures', async () => { const f = await setup(); await expect(f.act('user0', { type: 'GENERATE_FIXTURES' })).rejects.toMatchObject({ code: 'INVITATIONS_PENDING' }); await expect(f.act('user1', { type: 'TRADE', offeredPlayerId: 'p24', requestedPlayerId: 'p0' })).rejects.toMatchObject({ code: 'INVITATION_NOT_ACCEPTED' }); await expect(f.act('user0', { type: 'STATUS', status: 'COMPLETED' })).rejects.toMatchObject({ code: 'MATCHES_PENDING' }); await expect(f.service.create(f.room.id, 'user1', { addUnusedAuctionPurse:false, name: 'No' })).rejects.toMatchObject({ code: 'HOST_ONLY' }); f.room.status = 'RUNNING'; await expect(f.service.create(f.room.id, 'user0', { addUnusedAuctionPurse:false, name: 'No' })).rejects.toMatchObject({ code: 'AUCTION_NOT_COMPLETED' }); });
import { buildApp } from '../src/app.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import type { WebSocket } from 'ws';
function receive(ws: WebSocket, type: string) { return new Promise<Record<string, unknown>>((resolve, reject) => { const timeout = setTimeout(() => { ws.off('message', listener); reject(Error('Timeout ' + type)); }, 3000); function listener(raw: Buffer) { const e = JSON.parse(raw.toString()); if (e.type === type) {
    clearTimeout(timeout);
    ws.off('message', listener);
    resolve(e);
} } ws.on('message', listener); }); }
it('integrates authenticated REST, websocket invitations and exact reconnect state', async () => { const room = source(), rooms = new MemoryRoomRepository(); await rooms.create(room); const { app } = await buildApp({ authService: new StaticTokenAuthService(new Map(room.teams.map(t => [t.userId, { userId: t.userId }]))), repository: rooms, managerRepository: new MemoryManagerRepository(), logger: false, timersEnabled: false }); try {
    await app.ready();
    const rest = (user: string, path: string, body?: object) => app.inject({ method: body ? 'POST' : 'GET', url: '/api/manager-mode' + path, headers: { authorization: 'Bearer ' + user }, ...(body ? { payload: body } : {}) });
    expect((await app.inject({ url: '/api/manager-mode' })).statusCode).toBe(401);
    const inbox = await app.injectWS('/ws?token=user1', { headers: { origin: 'http://localhost:3000' } });
    const invited = receive(inbox, 'MANAGER_MODE_CREATED');
    const created = await rest('user0', '/from-auction/' + room.id, { addUnusedAuctionPurse:false, name: 'Realtime League', csv });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    expect((await invited).payload).toEqual({ tournamentId: id });
    let waiting = receive(inbox, 'MANAGER_MODE_STATE');
    inbox.send(JSON.stringify({ type: 'SUBSCRIBE_MANAGER_MODE', payload: { tournamentId: id,deltaUpdates:true } }));
    const initial=(await waiting).payload as Record<string,unknown>;expect(initial).toMatchObject({ myTeamId: 'team1' });
    waiting = receive(inbox, 'MANAGER_MODE_PATCH');
    expect((await rest('user1', '/' + id + '/actions', { requestId: randomUUID(), action: { type: 'INVITATION', accept: true } })).statusCode).toBe(200);
    const joined = await waiting;
    expect(joined.payload).toMatchObject({baseSequence:1,changes:{ sequence: 2 }});expect((joined.payload as {changes:object}).changes).not.toHaveProperty('players');expect(JSON.stringify(joined.payload).length).toBeLessThan(JSON.stringify(initial).length/5);
    inbox.terminate();
    const reconnect = await app.injectWS('/ws?token=user1', { headers: { origin: 'http://localhost:3000' } });
    waiting = receive(reconnect, 'MANAGER_MODE_STATE');
    reconnect.send(JSON.stringify({ type: 'SUBSCRIBE_MANAGER_MODE', payload: { tournamentId: id } }));
    expect((await waiting).payload).toEqual({...initial,...(joined.payload as {changes:object}).changes});
    expect((await rest('user1', '/' + id)).json().teams).toHaveLength(8);
    expect((await rest('user1', '/' + id + '/actions', { requestId: randomUUID(), action: { type: 'WINDOW', open: true } })).statusCode).toBe(403);
    expect((await rest('user0', '/' + id + '/actions', { requestId: randomUUID(), action: { type: 'SCORE', fixtureId: 'x', homeScore: -1, awayScore: 0 } })).statusCode).toBe(400);
}
finally {
    await app.close();
} });
it('automatically completes seasons, freezes history and ends read-only', async () => {
 const f=await setup(true);const state=await f.service.state(f.state.id,'user0');
 for(const match of state.fixtures)await f.act('user0',{type:'SCORE',fixtureId:match.id,homeScore:1,awayScore:0});
 const finished=await f.service.state(f.state.id,'user0');
 expect(finished.standings.every(row=>row.played===7)).toBe(true);
 expect(finished.seasonData!.seasons[0]!.status).toBe('COMPLETED');
 expect(finished.seasonData!.bonuses).toHaveLength(8);
 await expect(f.act('user0',{type:'SCORE',fixtureId:state.fixtures[0]!.id,homeScore:2,awayScore:2})).rejects.toMatchObject({code:'HISTORICAL_SEASON'});
 await expect(f.act('user0',{type:'STATUS',status:'ACTIVE'})).rejects.toMatchObject({code:'SEASON_COMPLETED'});
 await f.act('user0',{type:'END_MANAGER_MODE',confirmation:'END MANAGER MODE'});
 await expect(f.act('user0',{type:'WINDOW',open:true})).rejects.toMatchObject({code:'MANAGER_MODE_ENDED'});
});
it('does not broadcast if a repository rejects the transaction',async()=>{
 const f=await setup();let broadcasts=0;f.service.subscribe(()=>{broadcasts++;});
 f.repo.mutate=async()=>{throw Error('Database unavailable');};
 await expect(f.act('user1',{type:'INVITATION',accept:true})).rejects.toThrow('Database unavailable');
 expect(broadcasts).toBe(0);expect((await f.repo.find(f.state.id))?.sequence).toBe(1);
});
it('fails clearly when production persistence has not been injected',async()=>{
 const {app}=await buildApp({authService:new StaticTokenAuthService(new Map([['host',{userId:'host'}]])),logger:false,timersEnabled:false});
 try{const result=await app.inject({url:'/api/manager-mode',headers:{authorization:'Bearer host'}});expect(result.statusCode).toBe(503);expect(result.json().error.code).toBe('MANAGER_PERSISTENCE_UNAVAILABLE');}finally{await app.close();}
});
it('allows browser DELETE preflight and host-only deletion without a JSON body',async()=>{
 const room=source(),rooms=new MemoryRoomRepository();await rooms.create(room);const repository=new MemoryManagerRepository();
 const {app}=await buildApp({authService:new StaticTokenAuthService(new Map(room.teams.map(t=>[t.userId,{userId:t.userId}]))),repository:rooms,managerRepository:repository,logger:false,timersEnabled:false});
 try{const created=await app.inject({method:'POST',url:'/api/manager-mode/from-auction/'+room.id,headers:{authorization:'Bearer user0'},payload:{name:'Delete check'}});expect(created.statusCode).toBe(200);const url='/api/manager-mode/'+created.json().id;
 const preflight=await app.inject({method:'OPTIONS',url,headers:{origin:'http://localhost:3000','access-control-request-method':'DELETE','access-control-request-headers':'authorization'}});
 expect(preflight.statusCode).toBe(204);expect(preflight.headers['access-control-allow-methods']).toContain('DELETE');expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
 expect((await app.inject({method:'DELETE',url,headers:{origin:'http://localhost:3000',authorization:'Bearer user1'}})).statusCode).toBe(403);
 expect((await app.inject({method:'DELETE',url,headers:{origin:'http://localhost:3000',authorization:'Bearer user0'}})).statusCode).toBe(204);
 expect((await app.inject({url,headers:{authorization:'Bearer user0'}})).statusCode).toBe(404);expect(await rooms.findByCode(room.code)).not.toBeNull();
 }finally{await app.close();}
});
