export const formations={
 '4-3-3':[['LW','ST','RW'],['CM','CDM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-2-3-1':[['ST'],['LM','CAM','RM'],['CDM','CDM'],['LB','CB','CB','RB'],['GK']],
 '4-4-2':[['ST','ST'],['LM','CM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '3-5-2':[['ST','ST'],['LM','CM','CDM','CM','RM'],['CB','CB','CB'],['GK']],
 '4-1-2-1-2':[['ST','ST'],['CAM'],['CM','CM'],['CDM'],['LB','CB','CB','RB'],['GK']],
 '5-3-2':[['ST','ST'],['CM','CDM','CM'],['LWB','CB','CB','CB','RWB'],['GK']]
} as const;
export type Formation=keyof typeof formations;
export interface TeamSheet {teamId:string;formation:Formation;slots:(string|null)[];bench:string[];captainId:string|null;updatedAt:number}
export interface MatchLineup {fixtureId:string;teamId:string;starters:string[];bench:string[];eligiblePlayerIds:string[];scorers:{playerId:string;goals:number}[];capturedAt:number;lineupAvailable:boolean}
export interface PlayerContract {playerId:string;teamId:string;ownershipToken:string;contractStart:number;contractEnd:number;renewalCount:number}
export interface SquadData {sheets:TeamSheet[];lineups:MatchLineup[];contracts:PlayerContract[]}
export type SquadAction={type:'SAVE_TEAM_SHEET';formation:Formation;slots:(string|null)[];bench:string[];captainId:string|null}|{type:'RENEW_CONTRACT';playerId:string};
export interface PlayerSeasonStats {matchesPlayed:number;goals:number}
