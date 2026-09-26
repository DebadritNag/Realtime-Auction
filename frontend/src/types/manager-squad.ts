import type {Formation} from '@/lib/formations';
export {formations,type Formation} from '@/lib/formations';
export interface TeamSheet {teamId:string;formation:Formation;slots:(string|null)[];bench:string[];captainId:string|null;updatedAt:number}
export interface MatchLineup {fixtureId:string;teamId:string;starters:string[];bench:string[];eligiblePlayerIds:string[];scorers:{playerId:string;goals:number}[];capturedAt:number;lineupAvailable:boolean}
export interface PlayerContract {playerId:string;teamId:string;ownershipToken:string;contractStart:number;contractEnd:number;renewalCount:number}
export interface SquadData {sheets:TeamSheet[];lineups:MatchLineup[];contracts:PlayerContract[]}
export type SquadAction={type:'SAVE_TEAM_SHEET';formation:Formation;slots:(string|null)[];bench:string[];captainId:string|null}|{type:'RENEW_CONTRACT';playerId:string};
export interface PlayerSeasonStats {matchesPlayed:number;goals:number}

