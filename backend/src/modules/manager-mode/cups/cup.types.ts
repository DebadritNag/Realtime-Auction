import type {Fixture,Standing} from '../manager.types.js';
import type {SquadData} from '../squad/squad.types.js';
export interface CupSettings {enabled:boolean;name:string;qualifiedTeams:number;groupStage:boolean;groupMeetings:1|2;semiFinalLegs:1|2;finalLegs:1|2;thirdPlace:boolean}
export interface CupFixture extends Fixture {stage:'GROUP'|'SEMI_FINAL'|'FINAL'|'THIRD_PLACE';group?:'A'|'B';tieId?:string;leg:number}
export interface CupTie {id:string;stage:'SEMI_FINAL'|'FINAL'|'THIRD_PLACE';teamIds:[string,string];winnerTeamId:string|null;penaltyWinnerTeamId:string|null}
export interface CupCompetition {
 id:string;seasonId:string;settings:CupSettings;status:'NOT_STARTED'|'WAITING_FOR_LEAGUE'|'QUALIFIED'|'DRAW_READY'|'GROUP_STAGE'|'SEMI_FINAL'|'FINAL'|'COMPLETED';
 qualified:Standing[];groups:{name:'A'|'B';teamIds:string[]}[];fixtures:CupFixture[];ties:CupTie[];
 lineups:SquadData['lineups'];drawnAt:number|null;completedAt:number|null;championTeamId:string|null;finishes:Record<string,string>;
}
export interface Trophy {id:string;seasonId:string;teamId:string;type:'LEAGUE_SHIELD'|'CUP';competitionId:string|null;name:string;wonAt:number|null}
export interface CupData {competitions:CupCompetition[];trophies:Trophy[]}
export type CupAction={type:'CUP_DRAW'}|{type:'CUP_SETTINGS';settings:CupSettings}|{type:'CUP_SCORE';fixtureId:string;homeScore:number;awayScore:number;scorers:Record<string,{playerId:string;goals:number}[]>}|{type:'CUP_PENALTIES';tieId:string;winnerTeamId:string};
