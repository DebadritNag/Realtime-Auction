import type { TournamentState, TournamentSummary } from './manager-mode';
/** Wire contract: backend/src/modules/rooms/room-state.ts and WEBSOCKET_PROTOCOL.md.
 * All public monetary amounts are Cr; integer half-Cr units stay inside Fastify. */
export type RoomStatus = 'LOBBY'|'STARTING'|'RUNNING'|'PAUSED'|'COMPLETED'|'CLOSED';
export interface SettingsDTO {
 numberOfTeams:number; minimumParticipants:number; startingBudgetCr:number; minSquadSize:number; maxSquadSize:number;
 playerTimerSeconds:number; antiSnipingEnabled:boolean; antiSnipingThresholdSeconds:number; antiSnipingResetSeconds:number;
 minimumBasePriceCr:number; allowCustomBids:boolean; autoAdvance:boolean; transitionDelaySeconds:number;
 playerPoolConfig:{playerIds?:string[];potIds?:string[]};
}
export interface PlayerDTO {
 id:string;name:string;position:'GK'|'DEF'|'MID'|'FWD';ovr:number;stats:Record<string,number>;basePriceCr:number;potId:string;
 status:'WAITING'|'ACTIVE'|'SOLD'|'UNSOLD'|'SKIPPED';round:number;unsoldReason?:'UNANIMOUS_SKIP';
 club?:string;nationality?:string;age?:number;preferredFoot?:string;photoUrl?:string;
 subPosition?:string; // specific football position, e.g. CB, LB, ST, CM
}
export interface TeamDTO {
 id:string;userId:string;name:string;logoUrl?:string;logoEmoji?:string;startingBudgetCr:number;spentCr:number;
 remainingBudgetCr:number;playerIds:string[];playersOwned:number;maximumPermittedBidCr:number;minimumSquadMet:boolean;
 managerUsername?:string; // real username when available from hub connections
}
export interface PurchaseDTO {id:string;playerId:string;teamId:string;priceCr:number;bidCount:number;at:number;durationMs:number}
export interface BidDTO {id:string;roomId:string;playerId:string;teamId:string;amountCr:number;at:number;round:number}
export interface RoomStateDTO {
 room:{id:string;code:string;auctionName:string;createdAt:number}; roomId:string;roomCode:string;settings:SettingsDTO;status:RoomStatus;
 activationId:string|null;skipVote:{votes:number;required:number;hasCurrentUserVoted:boolean};
 host:{userId:string;teamId?:string};currentPlayer:PlayerDTO|null;activePotId:string|null;activePlayerId:string|null;
 currentBidCr:number|null;highestBidderTeamId:string|null;minimumNextBidCr:number|null;maximumPermittedBidCr:number;
 startedAt:number|null;endsAt:number|null;remainingTimeMs:number|null;biddingOpen:boolean;lastBidAt:number|null;
 bidCount:number;nextPlayerAt:number|null;serverTime:number;sequence:number;teams:TeamDTO[];currentUserTeam:TeamDTO;
 connectedUsers:string[];players:PlayerDTO[];playerQueue:string[];playerQueueSummary:{remaining:number};
 soldPlayers:PurchaseDTO[];unsoldPlayers:PlayerDTO[];
}
export interface RecommendationDTO {
 recommendedMinCr:number;recommendedMaxCr:number;suggestedCeilingCr:number;budgetRisk:'LOW'|'MEDIUM'|'HIGH';
 squadNeedScore:number;scarcityScore:number;reasons:string[];warnings:string[];sequence:number;playerId:string;
}
export interface ResultsDTO {
 roomId:string;status:RoomStatus;sequence:number;provisional:boolean;teams:(TeamDTO & {players:PlayerDTO[]})[];
 playersSold:number;unsoldCount:number;skippedCount:number;totalSpendCr:number;averageSaleCr:number;
 mostExpensivePurchase:{playerId:string;teamId:string;priceCr:number}|null;
 highestRemainingBudget:TeamDTO|null;longestBiddingWar:{playerId:string;bidCount:number;durationMs:number}|null;
 mostPlayersPurchased:TeamDTO|null;
}
type RoomPayload={roomCode:string;expectedSequence?:number};
export type HostCommand='START_AUCTION'|'PAUSE_AUCTION'|'RESUME_AUCTION'|'NEXT_PLAYER'|'MARK_UNSOLD'|'START_RECALL'|'END_AUCTION';
export type ClientCommand =
 | {type:'JOIN_ROOM'|'REJOIN_ROOM'|'REQUEST_STATE';payload:{roomCode:string};requestId?:string}
 | {type:HostCommand;payload:RoomPayload;requestId?:string}
 | {type:'PLACE_BID';payload:RoomPayload & {amountCr:number;playerId?:string};requestId?:string}
 | {type:'VOTE_SKIP_PLAYER'|'REMOVE_SKIP_VOTE';payload:RoomPayload & {playerId:string;activationId:string};requestId?:string}
 | {type:'RECALL_PLAYERS';payload:RoomPayload & {playerIds:string[]};requestId?:string}
 | {type:'KICK_MEMBER';payload:RoomPayload & {targetTeamId:string};requestId?:string}
 | {type:'UPDATE_SETTINGS';payload:RoomPayload & {settings:Partial<SettingsDTO>};requestId?:string}
 | {type:'PING';payload?:Record<string,never>;requestId?:string};
interface Payloads {
 MANAGER_MODE_STATE:TournamentState;MANAGER_MODE_INBOX:TournamentSummary[];
 MANAGER_MODE_CREATED:{tournamentId:string};MANAGER_MODE_UPDATED:{tournamentId:string};
 CONNECTED:{connectionId:string;userId:string;heartbeatIntervalMs:number};
 ROOM_STATE:RoomStateDTO;
 ROOM_UPDATED:{reason?:string};MEMBER_JOINED:{teamId:string};MEMBER_LEFT:{teamId?:string;userId?:string};
 PRESENCE_UPDATED:{connectedUsers:string[]};
 AUCTION_STARTED:Record<string,never>;
 PLAYER_STARTED:{player:PlayerDTO;basePriceCr:number;currentBidCr:number;minimumNextBidCr:number;highestBidderTeamId:null;startedAt:number;endsAt:number};
 BID_UPDATED:{playerId:string;amountCr:number;highestBidderTeamId:string;minimumNextBidCr:number;endsAt:number;bidCount:number};
 TIMER_EXTENDED:{playerId:string;endsAt:number};
 PLAYER_SOLD:{playerId:string;teamId:string;priceCr:number;remainingBudgetCr:number;teamPlayerCount:number};
 SKIP_VOTE_UPDATED:{playerId:string;activationId:string;votes:number;required:number;reason:'BID_ACCEPTED'|'VOTE_CAST'|'VOTE_REMOVED'};
 PLAYER_UNSOLD:{playerId:string;reason?:'UNANIMOUS_SKIP'};
 PLAYER_RECALLED:{playerId:string;status:'WAITING';round:number};
 TEAM_UPDATED:{teamId:string};
 BUDGET_UPDATED:{teamId:string;spentCr:number;remainingBudgetCr:number};
 AUCTION_PAUSED:{remainingTimeMs:number|null};AUCTION_RESUMED:{endsAt:number|null};
 AUCTION_COMPLETED:Record<string,never>;
 COMMAND_ACK:{sequence:number;duplicate:boolean};
 BID_REJECTED:{reason:string;message:string;minimumNextBidCr?:number};
 ERROR:{reason:string;message:string;minimumNextBidCr?:number};PONG:Record<string,never>;
}
export type ServerEvent = {[K in keyof Payloads]:{type:K;payload:Payloads[K];roomId?:string;sequence:number;serverTime:number;requestId?:string}}[keyof Payloads];
export function parseServerEvent(raw:string):ServerEvent {
 const value:unknown=JSON.parse(raw);
 if(!value || typeof value!=='object') throw new Error('Invalid server event');
 const e=value as Record<string,unknown>;
 const names=['MANAGER_MODE_STATE','MANAGER_MODE_INBOX','MANAGER_MODE_CREATED','MANAGER_MODE_UPDATED','CONNECTED','ROOM_STATE','ROOM_UPDATED','MEMBER_JOINED','MEMBER_LEFT','PRESENCE_UPDATED','AUCTION_STARTED','PLAYER_STARTED','BID_UPDATED','TIMER_EXTENDED','PLAYER_SOLD','PLAYER_UNSOLD','SKIP_VOTE_UPDATED','PLAYER_RECALLED','TEAM_UPDATED','BUDGET_UPDATED','AUCTION_PAUSED','AUCTION_RESUMED','AUCTION_COMPLETED','COMMAND_ACK','BID_REJECTED','ERROR','PONG'];
 if(typeof e.type!=='string'||!names.includes(e.type)||typeof e.sequence!=='number'||typeof e.serverTime!=='number'||!e.payload||typeof e.payload!=='object') throw new Error('Unsupported server event');
 if(e.type==='MANAGER_MODE_STATE'){const p=e.payload as Record<string,unknown>;if(typeof p.id!=='string'||typeof p.sequence!=='number'||!Array.isArray(p.teams)||!Array.isArray(p.players)||!Array.isArray(p.fixtures)||!Array.isArray(p.standings))throw new Error('Invalid tournament snapshot');}
 if(e.type==='ROOM_STATE'){
  const p=e.payload as Record<string,unknown>;
  if(typeof p.roomCode!=='string'||typeof p.sequence!=='number'||!Array.isArray(p.teams)||!Array.isArray(p.players)||!p.settings||!p.currentUserTeam) throw new Error('Invalid room snapshot');
 }
 return value as ServerEvent;
}
