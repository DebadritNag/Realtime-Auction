import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Room} from '../src/domain/types.js';
import {settingsSchema} from '../src/schemas/settings.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {defaultExternalPool,assertReleaseCooldown,hydrateReleaseOrigins} from '../src/modules/manager-mode/free-agent-pool.js';
import {importExternalCsv} from '../src/modules/manager-mode/external-import.service.js';
import {freeAgentValues} from '../src/modules/manager-mode/negotiation/valuation.service.js';
function source(): Room { const teams = Array.from({ length: 8 }, (_, i) => ({ id: 'team' + i, userId: 'user' + i, name: 'Team ' + i, startingBudgetUnits: 400, spentUnits: 48, playerIds: Array.from({ length: 24 }, (_, j) => 'p' + (i * 24 + j)) })); return { id: 'auction-id', code: 'ABC234', hostUserId: 'user0', auctionName: 'Acceptance League', status: 'COMPLETED', createdAt: 1, settings: settingsSchema.parse({ numberOfTeams: 8, startingBudgetCr: 200, maxSquadSize: 24 }), teams, players: Array.from({ length: 212 }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i, position: 'MID', subPosition: i%24===0?'GK':'CM', ovr: 80, stats: { passing: 80 }, basePriceUnits: 2, potId: 'gold', status: i < 192 ? 'SOLD' : 'UNSOLD', round: 1 })), purchases: teams.flatMap(t => t.playerIds.map(playerId => ({ id: randomUUID(), playerId, teamId: t.id, priceUnits: 2, bidCount: 1, at: 1, durationMs: 1000 }))), active: null, playerQueue: [], bids: [], sequence: 50, nextPlayerAt: null, receipts: {} }; }



async function setup(){const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room);let state=await service.create(room.id,'user0',{name:'Pool tests',addUnusedAuctionPurse:false});const act=(user:string,a:Parameters<typeof service.mutate>[3],id=randomUUID())=>service.mutate(state.id,user,id,a);for(let i=1;i<8;i++)await act('user'+i,{type:'INVITATION',accept:true});await act('user0',{type:'GENERATE_FIXTURES'});state=await act('user0',{type:'WINDOW',open:true});return {room,repo,service,state,act};}
it('includes every unowned auction status and automatically seeds/deduplicates the default CSV',async()=>{
 const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room);
 const seed=importExternalCsv(await defaultExternalPool(),[]);room.players[192]!.status='WAITING';room.players[193]!.status='SKIPPED';room.players[0]!.externalId=seed.players[0]!.id;
 const [a,b]=await Promise.all([service.create(room.id,'user0',{name:'All sources'}),service.create(room.id,'user0',{name:'Retry'})]);
 expect(a.id).toBe(b.id);expect(a.players.filter(p=>p.currentTeamId)).toHaveLength(192);expect(a.players.filter(p=>p.source==='EXTERNAL_POOL')).toHaveLength(seed.players.length-1);
 expect(a.players.find(p=>p.id==='p192')).toMatchObject({ownershipStatus:'FREE_AGENT',metadata:{freeAgentReason:'AUCTION_UNSEEN'}});expect(a.players.find(p=>p.id==='p193')!.currentTeamId).toBeNull();expect(a.players.some(p=>p.id===seed.players[0]!.id)).toBe(false);expect(new Set(a.players.map(p=>p.id)).size).toBe(a.players.length);
});
it('releases atomically, discounts value, prevents duplicate credit and same-team re-signing after reload',async()=>{
 const f=await setup(),quote=f.state.saleQuotes!.p0!,budget=f.state.teams[0]!.transferBudgetUnits;const before=f.state.players.find(p=>p.id==='p0')!;
 const sale={type:'SELL_PLAYER',playerId:'p0',ownershipToken:quote.ownershipToken,expectedSaleUnits:quote.saleValueUnits} as const;
 const results=await Promise.allSettled([f.act('user0',sale),f.act('user0',sale)]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 const reloaded=new ManagerModeService(f.repo,async()=>f.room);const state=await reloaded.state(f.state.id,'user0'),released=state.players.find(p=>p.id==='p0')!;
 expect(released).toMatchObject({name:before.name,source:before.source,stats:before.stats,currentTeamId:null,ownershipStatus:'FREE_AGENT',metadata:{freeAgentReason:'TEAM_RELEASE',releasedByTeamId:'team0'}});expect(state.teams.find(t=>t.id==='team0')!.transferBudgetUnits).toBe(budget+quote.saleValueUnits);expect(state.transactions.filter(t=>t.playerId==='p0'&&t.type==='RELEASE')).toHaveLength(1);
 expect(freeAgentValues(released,'BALANCED').marketValueUnits).toBeLessThanOrEqual(freeAgentValues(before,'BALANCED').marketValueUnits);
 await expect(f.act('user0',{type:'START_NEGOTIATION',playerId:'p0'})).rejects.toMatchObject({code:'RELEASE_RESIGN_COOLDOWN'});
 expect(()=>assertReleaseCooldown(released,'team0',Number(released.metadata.releasedAt)+24*3600000)).not.toThrow();
 let other=await f.act('user1',{type:'START_NEGOTIATION',playerId:'p0'});const session=other.negotiation.sessions.find(s=>s.playerId==='p0')!;
 other=await f.act('user1',{type:'OFFER_FREE_AGENT',sessionId:session.id,amountUnits:100});expect(other.negotiation.sessions.find(s=>s.id===session.id)!.status).toBe('ACCEPTED');
 other=await f.act('user1',{type:'CONFIRM_SIGNING',sessionId:session.id});expect(other.players.find(p=>p.id==='p0')!.currentTeamId).toBe('team1');expect(other.transactions.filter(t=>t.playerId==='p0').map(t=>t.type)).toEqual(['AUCTION_PURCHASE','RELEASE','FREE_AGENT_SIGNING']);
 const aggregate=(await f.repo.find(f.state.id))!;delete aggregate.players[0]!.metadata.freeAgentReason;hydrateReleaseOrigins(aggregate);expect(aggregate.players.find(p=>p.id==='p0')!.metadata.freeAgentReason).not.toBe('TEAM_RELEASE');
});
it('scopes private trade/buyout notifications and read state to the owning user, including host',async()=>{
 const f=await setup();const offered=await f.act('user1',{type:'TRADE',offeredPlayerId:'p24',requestedPlayerId:'p48'});const trade=offered.trades.at(-1)!;
 const recipient=await f.service.state(f.state.id,'user2');expect(recipient.unseenOffers).toContain('trade:'+trade.id);
 const host=await f.service.state(f.state.id,'user0');expect(host.trades.some(t=>t.id===trade.id)).toBe(false);expect(host.notifications.some(n=>n.metadata.entityId===trade.id)).toBe(false);
 await expect(f.act('user0',{type:'READ_NOTIFICATION',notificationId:recipient.notifications.at(-1)!.id})).rejects.toMatchObject({code:'NOTIFICATION_NOT_FOUND'});
 const read=await f.act('user2',{type:'READ_OFFER',entityType:'trade',entityId:trade.id});expect(read.unseenOffers).not.toContain('trade:'+trade.id);expect((await f.service.state(f.state.id,'user1')).notifications.some(n=>n.metadata.entityId===trade.id&&!n.read)).toBe(true);
 await f.act('user1',{type:'BUYOUT',targetPlayerId:'p48',offerType:'CASH',cashAmountUnits:8});expect((await f.service.state(f.state.id,'user2')).unseenOffers!.some(k=>k.startsWith('buyout:'))).toBe(true);
 const cleared=await f.act('user2',{type:'READ_ALL_NOTIFICATIONS'});expect(cleared.notificationUnread).toBe(0);expect(cleared.unseenOffers).toEqual([]);
});
it('pages notification history without dropping equal-timestamp rows or exposing other users',async()=>{
 const f=await setup();await f.repo.mutate(f.state.id,t=>{for(let i=0;i<155;i++)t.notifications.push({id:'notice'+i,userId:'user1',type:'TEST',title:'Update',message:'Private',createdAt:123,read:false,metadata:{tournamentId:t.id}});});
 const state=await f.service.state(f.state.id,'user1');expect(state.notifications).toHaveLength(100);expect(state.notificationUnread).toBeGreaterThanOrEqual(155);
 const ids:string[]=[];let cursor:string|undefined;do{const page=await f.service.notifications(f.state.id,'user1',cursor);ids.push(...page.items.map(n=>n.id));expect(page.items.every(n=>n.userId==='user1')).toBe(true);cursor=page.nextBefore??undefined;}while(cursor);expect(new Set(ids).size).toBe(ids.length);expect(ids.filter(id=>id.startsWith('notice'))).toHaveLength(155);
});

it('bounds closed offer payloads and pages only authorized history',async()=>{
 const f=await setup();await f.repo.mutate(f.state.id,t=>{for(let i=0;i<160;i++)t.trades.push({id:'trade'+i,fromTeamId:'team1',toTeamId:'team2',offeredPlayerId:'p24',requestedPlayerId:'p48',status:'REJECTED',parentTradeId:null,createdBy:'user1',createdAt:i,updatedAt:i});});
 const view=await f.service.state(f.state.id,'user1');expect(view.trades).toHaveLength(50);expect(view.historyCursors!.trades).toBe('trade110');
 const page=await f.service.history(f.state.id,'user1','trades',view.historyCursors!.trades!);expect(page.items).toHaveLength(50);expect(page.items[0]!.id).toBe('trade109');
 expect((await f.service.history(f.state.id,'user0','trades')).items).toEqual([]);await expect(f.service.history(f.state.id,'user0','messages',undefined,'foreign')).rejects.toMatchObject({code:'NEGOTIATION_PERMISSION'});
});
