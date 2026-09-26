import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {importExternalCsv} from '../src/modules/manager-mode/external-import.service.js';
import {parseCsv} from '../src/modules/players/player.service.js';
import {freeAgentValues,competitiveValues} from '../src/modules/manager-mode/negotiation/valuation.service.js';
import {profileFor} from '../src/modules/manager-mode/negotiation/negotiation.engine.js';
import {archetypes} from '../src/modules/manager-mode/negotiation/negotiation.types.js';
const csv=readFileSync(new URL('../data/manager-mode/external-players.csv',import.meta.url),'utf8');
const pool=importExternalCsv(csv,[]);
it('generated pool imports as 357 unique regular free agents, with no auction overlap',()=>{
 const auctionIds=new Set(['gk','def','mid','att','default-player-pool'].flatMap(name=>parseCsv(readFileSync(new URL('../data/default-pool/'+name+'.csv',import.meta.url),'utf8')).map(p=>p.player_id)));
 expect(pool.invalidRows).toEqual([]);expect(pool.validPlayers).toBe(357);expect(pool.duplicates).toBe(0);expect(new Set(pool.players.map(p=>p.id)).size).toBe(357);
 expect(pool.players.every(p=>p.overall>=79&&!auctionIds.has(p.id)&&p.currentTeamId===null&&p.ownershipStatus==='FREE_AGENT'&&p.source==='EXTERNAL_POOL')).toBe(true);
 expect(pool.players.some(p=>p.overall===79)).toBe(true);expect(pool.players.every(p=>p.metadata.league&&p.metadata.preferredFoot)).toBe(true);
 expect(pool.players.filter(p=>p.category==='GK')).toHaveLength(58);
});
it('all personalities stay within practical free-agent bands; unsold expectation is lower',()=>{
 for(const [overall,ceiling] of [[79,6],[80,6],[81,10],[82,10],[83,14],[84,14],[85,20],[86,20],[87,28],[88,28],[89,36],[94,36]]){
  for(const archetype of archetypes){const player={...pool.players[0]!,overall:overall!,source:'EXTERNAL_POOL' as const};const value=freeAgentValues(player,archetype);const unsold=freeAgentValues({...player,source:'AUCTION_UNSOLD'},archetype);
  expect(value.preferredValueUnits).toBeLessThanOrEqual(ceiling!);expect(value.minimumValueUnits).toBeLessThanOrEqual(value.preferredValueUnits);expect(value.idealValueUnits).toBeGreaterThanOrEqual(value.preferredValueUnits);expect(Object.values(value).every(Number.isInteger)).toBe(true);expect(unsold.preferredValueUnits).toBeLessThanOrEqual(value.preferredValueUnits);}
 }
});
it('valuation varies within a band and competition cannot cause runaway inflation',()=>{
 const player={...pool.players[0]!,overall:82};const profile=profileFor('test',player);const calm=competitiveValues(profile,0,0),competitive=competitiveValues(profile,3,profile.preferredValueUnits+4),extreme=competitiveValues(profile,100,1000000);
 expect(competitive.preferredValueUnits).toBeGreaterThanOrEqual(calm.preferredValueUnits);expect(extreme.preferredValueUnits).toBeLessThanOrEqual(Math.round(profile.preferredValueUnits*1.35));expect(extreme.idealValueUnits).toBeLessThanOrEqual(Math.round(profile.preferredValueUnits*1.6));
 const values=new Set(Array.from({length:40},(_,i)=>freeAgentValues({...player,id:String(i),age:i%2?20:35,position:i%3?'CB':'ST'},i%2?'MONEY_DRIVEN':'RELAXED').preferredValueUnits));expect(values.size).toBeGreaterThan(1);
});
