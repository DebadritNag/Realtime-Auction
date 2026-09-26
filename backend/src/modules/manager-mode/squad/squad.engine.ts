import {randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament,Fixture} from '../manager.types.js';
import {ownershipToken} from '../buyout/buyout.engine.js';
import {formations,type SquadAction,type PlayerSeasonStats} from './squad.types.js';
import {canPlay,isFormation} from '../../../domain/formations.js';
export const ensureSquad=(t:Tournament)=>t.squadData??={sheets:[],lineups:[],contracts:[]};
export function synchronizeSheets(t:Tournament){const data=ensureSquad(t);data.contracts=data.contracts.filter(c=>t.players.some(p=>p.id===c.playerId&&p.currentTeamId===c.teamId)&&ownershipToken(t,c.playerId)===c.ownershipToken);for(const sheet of ensureSquad(t).sheets){const owned=new Set(t.players.filter(p=>p.currentTeamId===sheet.teamId).map(p=>p.id));sheet.slots=sheet.slots.map(id=>id&&owned.has(id)?id:null);sheet.bench=sheet.bench.filter(id=>owned.has(id));if(sheet.captainId&&!sheet.slots.includes(sheet.captainId))sheet.captainId=null;}}
export function squadAction(t:Tournament,user:string,a:SquadAction,now=Date.now()){
 const team=t.teams.find(x=>x.managerUserId===user)!;const data=ensureSquad(t);const owned=t.players.filter(x=>x.currentTeamId===team.id);
 if(a.type==='SAVE_TEAM_SHEET'){
 const ids=[...a.slots.filter((id):id is string=>id!==null),...a.bench];requireThat(new Set(ids).size===ids.length,'DUPLICATE_LINEUP_PLAYER','A player can appear only once in the team sheet.');requireThat(ids.every(id=>owned.some(p=>p.id===id)),'INVALID_OWNERSHIP','Select only players you currently own.',403);
 requireThat(isFormation(a.formation),'INVALID_FORMATION','Choose a supported formation.');
 const roles=formations[a.formation].flat();requireThat(a.slots.length===roles.length&&a.bench.length<=12,'INVALID_LINEUP','Use eleven formation slots and at most twelve substitutes.');
 a.slots.forEach((id,i)=>{if(!id)return;const p=owned.find(p=>p.id===id)!;requireThat(canPlay(p,roles[i]!),'INVALID_POSITION',p.name+' cannot play '+roles[i]+'. Select a compatible primary or secondary position.');});
 requireThat(!a.captainId||a.slots.includes(a.captainId),'INVALID_CAPTAIN','Captain must be in the starting eleven.');
 const sheet={teamId:team.id,formation:a.formation,slots:a.slots,bench:a.bench,captainId:a.captainId,updatedAt:now};data.sheets=data.sheets.filter(s=>s.teamId!==team.id);data.sheets.push(sheet);return;
 }
 const p=owned.find(p=>p.id===a.playerId);requireThat(p,'INVALID_OWNERSHIP','You can renew only your own player.',403);const token=ownershipToken(t,p.id);const existing=data.contracts.find(c=>c.playerId===p.id&&c.teamId===team.id&&c.ownershipToken===token);const end=new Date(Math.max(now,existing?.contractEnd??now));end.setUTCFullYear(end.getUTCFullYear()+1);
 data.contracts=data.contracts.filter(c=>c.playerId!==p.id);data.contracts.push({playerId:p.id,teamId:team.id,ownershipToken:token,contractStart:existing?.contractStart??now,contractEnd:end.getTime(),renewalCount:(existing?.renewalCount??0)+1});
 t.notifications.push({id:randomUUID(),userId:user,type:'CONTRACT_RENEWED',title:'Contract renewed',message:p.name+' renewed for one additional year. No transfer fee was charged.',read:false,createdAt:now,metadata:{playerId:p.id}});
}
export function recordMatch(t:Tournament,f:Fixture,goals:Record<string,{playerId:string;goals:number}[]>|undefined,now=Date.now(),capture=true){
 const data=ensureSquad(t);
 for(const [teamId,score] of [[f.homeTeamId,f.homeScore!],[f.awayTeamId,f.awayScore!]] as const){
 let lineup=data.lineups.find(x=>x.fixtureId===f.id&&x.teamId===teamId);
 if(!lineup){const sheet=capture?data.sheets.find(s=>s.teamId===teamId):undefined;const eligiblePlayerIds=t.players.filter(p=>p.currentTeamId===teamId).map(p=>p.id);lineup={fixtureId:f.id,teamId,eligiblePlayerIds,starters:sheet?.slots.filter((id):id is string=>id!==null&&eligiblePlayerIds.includes(id))??[],bench:sheet?.bench.filter(id=>eligiblePlayerIds.includes(id))??[],scorers:[],capturedAt:now,lineupAvailable:Boolean(sheet)};data.lineups.push(lineup);}
 const entries=goals?.[teamId]??lineup.scorers;requireThat(entries.every(x=>lineup!.eligiblePlayerIds.includes(x.playerId)),'INVALID_SCORER','A scorer must belong to this team at match capture.');requireThat(entries.reduce((n,x)=>n+x.goals,0)<=score,'SCORER_TOTAL_EXCEEDS_SCORE','Assigned goals cannot exceed the team score. Adjust the scorers when correcting a result.');
 const totals=new Map<string,number>();for(const g of entries)totals.set(g.playerId,(totals.get(g.playerId)??0)+g.goals);lineup.scorers=[...totals].map(([playerId,goals])=>({playerId,goals}));
 }
 if(goals)requireThat(Object.keys(goals).every(id=>id===f.homeTeamId||id===f.awayTeamId),'INVALID_SCORER_TEAM','Only fixture teams may have scorers.');
}
export function playerSeasonStats(t:Tournament):Record<string,PlayerSeasonStats>{const stats:Record<string,PlayerSeasonStats>={};const ids=new Set(t.fixtures.filter(f=>f.status==='COMPLETED'&&f.seasonId===t.seasonData?.currentSeasonId).map(f=>f.id));for(const row of ensureSquad(t).lineups){if(!ids.has(row.fixtureId))continue;for(const id of row.starters)(stats[id]??={matchesPlayed:0,goals:0}).matchesPlayed++;for(const g of row.scorers)(stats[g.playerId]??={matchesPlayed:0,goals:0}).goals+=g.goals;}return stats;}
