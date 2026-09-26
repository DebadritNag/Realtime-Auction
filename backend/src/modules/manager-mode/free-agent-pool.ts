import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {importExternalCsv} from './external-import.service.js';
import {DomainError,requireThat} from '../../domain/errors.js';
import type {ManagerPlayer,Tournament} from './manager.types.js';
let seed:Promise<string>|undefined;let seedPath='';
export async function defaultExternalPool(){
 const path=process.env.MANAGER_MODE_EXTERNAL_PLAYERS_PATH?resolve(process.env.MANAGER_MODE_EXTERNAL_PLAYERS_PATH):new URL('../../../data/manager-mode/external-players.csv',import.meta.url);
 if(seedPath!==String(path)){seed=undefined;seedPath=String(path);}
 seed??=readFile(path,'utf8').catch(error=>{seed=undefined;throw new DomainError('EXTERNAL_PLAYER_POOL_UNAVAILABLE','The default external player CSV is unavailable on the server. Deploy backend/data/manager-mode/external-players.csv or configure MANAGER_MODE_EXTERNAL_PLAYERS_PATH.',503,{step:'LOAD_EXTERNAL_PLAYERS',fileCode:typeof error?.code==='string'?error.code:'READ_FAILED'});});
 return seed;
}
export async function combinedImport(csv:string,excluded:string[]){
 let defaults;try{defaults=importExternalCsv(await defaultExternalPool(),excluded);}catch(error){if(error instanceof DomainError&&error.code==='EXTERNAL_PLAYER_POOL_UNAVAILABLE')throw error;throw new DomainError('INVALID_EXTERNAL_PLAYER_POOL','The default external player CSV is malformed. Correct the deployed CSV.',503,{step:'LOAD_EXTERNAL_PLAYERS'});}
 requireThat(defaults.players.length+defaults.duplicates>0&&defaults.invalidRows.length===0,'INVALID_EXTERNAL_PLAYER_POOL','The default external player CSV contains invalid or empty data. Correct the deployed CSV.',503,{step:'LOAD_EXTERNAL_PLAYERS',invalidRowCount:defaults.invalidRows.length});
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
