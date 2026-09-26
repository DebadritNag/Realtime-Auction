import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {importExternalCsv} from './external-import.service.js';
import {requireThat} from '../../domain/errors.js';
import type {ManagerPlayer,Tournament} from './manager.types.js';
let seed:Promise<string>|undefined;
export async function defaultExternalPool(){
 seed??=readFile(process.env.MANAGER_MODE_EXTERNAL_PLAYERS_PATH?resolve(process.env.MANAGER_MODE_EXTERNAL_PLAYERS_PATH):new URL('../../../data/manager-mode/external-players.csv',import.meta.url),'utf8').catch(error=>{seed=undefined;throw error;});
 return seed;
}
export async function combinedImport(csv:string,excluded:string[]){
 const defaults=importExternalCsv(await defaultExternalPool(),excluded);
 const extra=importExternalCsv(csv,[...excluded,...defaults.players.map(p=>p.id)]);
 return {rowsDetected:defaults.rowsDetected+extra.rowsDetected,validPlayers:defaults.validPlayers+extra.validPlayers,duplicates:defaults.duplicates+extra.duplicates,invalidRows:[...defaults.invalidRows,...extra.invalidRows],players:[...defaults.players,...extra.players],auditRows:[...(defaults.auditRows??[]),...(extra.auditRows??[]).map(r=>({...r,row:r.row+defaults.rowsDetected}))]};
}
/** The immutable transfer ledger is the persistence source for release metadata. */
export function hydrateReleaseOrigins(t:Tournament){
 const last=new Map(t.transactions.map(x=>[x.playerId,x]));
 for(const p of t.players){const release=last.get(p.id);if(!p.currentTeamId&&release?.type==='RELEASE')p.metadata={...p.metadata,freeAgentReason:'TEAM_RELEASE',releasedByTeamId:release.fromTeamId,releasedAt:release.at};else if(p.currentTeamId&&p.metadata.freeAgentReason==='TEAM_RELEASE'){delete p.metadata.freeAgentReason;delete p.metadata.releasedByTeamId;delete p.metadata.releasedAt;}}
}
export function releaseCooldownMs(){const value=Number(process.env.MANAGER_RELEASE_RESIGN_COOLDOWN_HOURS??24);return (Number.isFinite(value)&&value>=1?value:24)*3600000;}
export function assertReleaseCooldown(p:ManagerPlayer,teamId:string,now:number){
 requireThat(p.metadata.releasedByTeamId!==teamId||typeof p.metadata.releasedAt!=='number'||now>=p.metadata.releasedAt+releaseCooldownMs(),'RELEASE_RESIGN_COOLDOWN','Your club must wait before negotiating to re-sign a released player.',409);
}
