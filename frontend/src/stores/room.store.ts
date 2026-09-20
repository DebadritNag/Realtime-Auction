import { create } from 'zustand';
import type { AuctionRoom,RoomSettings } from '@/types';
import type { RoomStateDTO } from '@/types/backend';
import { roomService,type JoinRoomPayload } from '@/services/room.service';
import { mapRoom } from '@/services/contract';
import { normalizeError } from '@/services/api';
interface Store {
 room:AuctionRoom|null;currentTeamId:string|null;isHost:boolean;isLoading:boolean;error:string|null;
 applySnapshot:(s:RoomStateDTO)=>void;reset:()=>void;fetchRoom:(code:string)=>Promise<void>;
 createRoom:(settings:RoomSettings,teamName?:string)=>Promise<string|null>;
 joinRoom:(input:JoinRoomPayload)=>Promise<boolean>;
 updateSettings:(settings:Partial<RoomSettings>)=>Promise<void>;clearError:()=>void;
}
const initial={room:null,currentTeamId:null,isHost:false,isLoading:false,error:null};
export const useRoomStore=create<Store>((set,get)=>({
 ...initial,reset:()=>set(initial),clearError:()=>set({error:null}),
 applySnapshot:s=>set({room:mapRoom(s),currentTeamId:s.currentUserTeam.id,isHost:s.host.userId===s.currentUserTeam.userId,isLoading:false,error:null}),
 fetchRoom:async code=>{set({isLoading:true,error:null});try{get().applySnapshot(await roomService.getState(code));}catch(e){set({error:normalizeError(e).message,isLoading:false});}},
 createRoom:async(settings,teamName)=>{set({isLoading:true,error:null});try{const s=await roomService.createRoom(settings,teamName);get().applySnapshot(s);return s.roomCode;}catch(e){set({error:normalizeError(e).message,isLoading:false});return null;}},
 joinRoom:async input=>{set({isLoading:true,error:null});try{get().applySnapshot(await roomService.joinRoom(input));return true;}catch(e){set({error:normalizeError(e).message,isLoading:false});return false;}},
 updateSettings:async settings=>{const room=get().room;if(!room)return;try{get().applySnapshot(await roomService.updateSettings(room.roomCode,settings));}catch(e){set({error:normalizeError(e).message});}},
}));
