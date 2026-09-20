import type { RoomSettings } from '@/types';
import type { RoomStateDTO } from '@/types/backend';
import { api } from './api';
import { settingsToDTO,mapRoom } from './contract';
import { authService } from './auth.service';
export interface JoinRoomPayload {roomCode:string;teamName:string;teamLogo?:string}
export function validRoomCode(value:string):string {
 const code=value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw new Error('Enter the six-character room code.');
 return code;
}
export const roomService={
 getState:(code:string)=>api.get<RoomStateDTO>('/rooms/'+validRoomCode(code)+'/state'),
 async getRoom(code:string){return mapRoom(await this.getState(code));},
 async createRoom(settings:RoomSettings,teamName?:string){
  if(settings.playerPoolSource!=='default')throw new Error('Only the configured server player pool is available.');
  const user=await authService.getSession();
  const created=await api.post<{roomCode:string}>('/rooms',{auctionName:settings.auctionName,
   teamName:teamName||user?.defaultTeamName||((user?.username??'My')+' FC').slice(0,60),settings:settingsToDTO(settings)});
  return this.getState(created.roomCode);
 },
 async joinRoom(input:JoinRoomPayload){
  const code=validRoomCode(input.roomCode);
  // A refresh/rejoin never creates a second membership.
  try{return await this.getState(code);}catch(error){if(!(error instanceof Error)||!('status'in error)||error.status!==403)throw error;}
  await api.post('/rooms/'+code+'/join',{teamName:input.teamName,...(input.teamLogo?{teamLogoEmoji:input.teamLogo}:{})});
  return this.getState(code);
 },
 async updateSettings(code:string,settings:Partial<RoomSettings>){return api.patch<RoomStateDTO>('/rooms/'+validRoomCode(code)+'/settings',settingsToDTO(settings));},
 leave:(code:string)=>api.post<void>('/rooms/'+validRoomCode(code)+'/leave'),
};
