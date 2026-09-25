import type {Standing} from '../manager.types.js';
export interface Season {id:string;number:number;status:'ACTIVE'|'COMPLETED'|'ARCHIVED';championTeamId:string|null;startedAt:number;completedAt:number|null;endedEarly:boolean;bonusesAwardedAt:number|null;finalStandings:Standing[];}
export interface SeasonBonus {seasonId:string;teamId:string;position:number;amountUnits:number;awardedAt:number;}
export interface SeasonData {currentSeasonId:string;seasons:Season[];bonuses:SeasonBonus[];settings:{resalePercent:number;bonusUnits:number[]};}
export interface SaleQuote {playerId:string;basisUnits:number;saleValueUnits:number;ownershipToken:string;}
export type SeasonAction={type:'END_CURRENT_SEASON';confirmation:'END SEASON'}|{type:'START_NEXT_SEASON'}|{type:'END_MANAGER_MODE';confirmation:'END MANAGER MODE'}|{type:'SEASON_SETTINGS';resalePercent:number;bonusUnits:number[]}|{type:'SELL_PLAYER';playerId:string;ownershipToken:string;expectedSaleUnits:number};
