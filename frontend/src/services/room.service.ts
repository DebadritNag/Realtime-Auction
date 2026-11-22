import type { RoomSettings } from '@/types';
import type { RoomStateDTO,RoomSummaryDTO,RoomDetailsDTO } from '@/types/backend';
import { api,ApiError } from './api';
import { settingsToDTO,mapRoom } from './contract';
import { authService } from './auth.service';
export interface JoinRoomPayload {roomCode:string;teamName:string;teamLogo?:string;/** Restored rooms: the existing team to claim. Name and crest are ignored. */restoredTeamId?:string}
const RESTORE_JOIN_ERRORS:Record<string,string>={
 TEAM_ALREADY_CLAIMED:'That team has already been claimed by another manager. Pick a different team.',
 ALREADY_CLAIMED_ANOTHER_TEAM:'You already manage another team in this auction. Leave it before claiming a different one.',
};
export function validRoomCode(value:string):string {
 const code=value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw new Error('Enter the six-character room code.');
 return code;
}
export const roomService={
 getState:(code:string)=>api.get<RoomStateDTO>('/rooms/'+validRoomCode(code)+'/state'),
 async getRoom(code:string){return mapRoom(await this.getState(code));},
 async createRoom(settings:RoomSettings,teamName?:string){
  if(settings.playerPoolSource!=='default'&&settings.playerPoolSource!=='fc26')throw new Error('Only the configured server player pools are available.');
  const user=await authService.getSession();
  const created=await api.post<{roomCode:string}>('/rooms',{auctionName:settings.auctionName,
   teamName:teamName||user?.defaultTeamName||((user?.username??'My')+' FC').slice(0,60),settings:settingsToDTO(settings)});
  return this.getState(created.roomCode);
 },
 async joinRoom(input:JoinRoomPayload){
  const code=validRoomCode(input.roomCode);
  // A refresh/rejoin never creates a second membership.
  try{return await this.getState(code);}catch(error){if(!(error instanceof Error)||!('status'in error)||error.status!==403)throw error;}
  if(input.restoredTeamId){
   try{await api.post('/rooms/'+code+'/join',{restoredTeamId:input.restoredTeamId});}
   catch(error){
    if(error instanceof ApiError&&RESTORE_JOIN_ERRORS[error.code])throw new ApiError(RESTORE_JOIN_ERRORS[error.code],error.code,error.status);
    throw error;
   }
   return this.getState(code);
  }
  await api.post('/rooms/'+code+'/join',{teamName:input.teamName,...(input.teamLogo?{teamLogoEmoji:input.teamLogo}:{})});
  return this.getState(code);
 },
 async updateSettings(code:string,settings:Partial<RoomSettings>){return api.patch<RoomStateDTO>('/rooms/'+validRoomCode(code)+'/settings',settingsToDTO(settings));},
 myRooms:()=>api.get<{rooms:RoomSummaryDTO[];serverTime:number}>('/me/rooms'),
 summary:(code:string)=>api.get<RoomDetailsDTO>('/rooms/'+validRoomCode(code)+'/summary'),
 rejoin:(code:string)=>api.post<RoomSummaryDTO>('/rooms/'+validRoomCode(code)+'/rejoin'),
 leave:(code:string)=>api.post<void>('/rooms/'+validRoomCode(code)+'/leave'),
};
