import { create } from 'zustand';
import type { Player,Team,Bid,AISuggestion } from '@/types';
import type { RoomStateDTO,ServerEvent,HostCommand } from '@/types/backend';
import { webSocketService } from '@/services/websocket.service';
import { roomService } from '@/services/room.service';
import { auctionService } from '@/services/auction.service';
import { mapPlayer,mapTeams,mapRecommendation } from '@/services/contract';
import { useRoomStore } from './room.store';
import { normalizeError } from '@/services/api';
import { croreToUnits } from '@/lib/money';
export interface SoldOverlayState {active:boolean;player:Player|null;winningTeam:Team|null;price:number}
export interface UnsoldOverlayState {active:boolean;player:Player|null;recallCount:number}
export interface AntiSnipingNotice {active:boolean;secondsAdded:number;message:string}
interface Store{
 roomCode:string|null;snapshot:RoomStateDTO|null;sequence:number;auctionStatus:string;activePlayer:Player|null;
 currentBid:number;highestBidder:Team|null;endsAt:number|null;remainingTimeMs:number|null;serverTimeOffset:number;
 minimumNextBid:number;maximumPermittedBid:number;currentPot:string;teams:Team[];players:Player[];recentBids:Bid[];aiSuggestion:AISuggestion|null;
 soldOverlay:SoldOverlayState;unsoldOverlay:UnsoldOverlayState;antiSnipingNotice:AntiSnipingNotice|null;bidErrorNotice:string|null;
 initAuction:(code:string)=>void;leaveAuction:()=>void;handleServerEvent:(e:ServerEvent)=>void;
 placeBid:(amount:number)=>void;hostCommand:(type:HostCommand)=>Promise<void>;hostPause:()=>void;hostResume:()=>void;hostSkip:()=>void;hostEnd:()=>void;
 clearBidError:()=>void;clearAntiSnipingNotice:()=>void;dismissSoldOverlay:()=>void;dismissUnsoldOverlay:()=>void;
}
let unsubscribe:(()=>void)|undefined;let generation=0;
let recommendationTimer:ReturnType<typeof setTimeout>|undefined;
let noticeTimer:ReturnType<typeof setTimeout>|undefined;
const initial={
 roomCode:null,snapshot:null,sequence:0,auctionStatus:'LOBBY',activePlayer:null,currentBid:0,highestBidder:null,endsAt:null,
 remainingTimeMs:null,serverTimeOffset:0,minimumNextBid:0,maximumPermittedBid:0,currentPot:'',teams:[],players:[],recentBids:[],aiSuggestion:null,
 soldOverlay:{active:false,player:null,winningTeam:null,price:0},unsoldOverlay:{active:false,player:null,recallCount:0},antiSnipingNotice:null,bidErrorNotice:null,
};
export const useAuctionStore=create<Store>((set,get)=>({
 ...initial,
 initAuction:code=>{
  if(get().roomCode===code)return;
  get().leaveAuction();set({roomCode:code});const current=++generation;
  unsubscribe=webSocketService.subscribe(e=>get().handleServerEvent(e));
  // REST handles direct refresh/membership errors; socket replaces this with its newest snapshot.
  void roomService.getState(code).then(s=>{if(current===generation)get().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:s.roomId,sequence:s.sequence,serverTime:s.serverTime});})
   .catch(e=>{if(current===generation)set({bidErrorNotice:normalizeError(e).message});});
  webSocketService.connect(code);
 },
 leaveAuction:()=>{generation++;unsubscribe?.();unsubscribe=undefined;clearTimeout(recommendationTimer);clearTimeout(noticeTimer);webSocketService.disconnect();set(initial);useRoomStore.getState().reset();},
 handleServerEvent:event=>{
  const state=get();
  if(event.roomId&&state.snapshot&&event.roomId!==state.snapshot.roomId)return;
  if(event.roomId&&event.sequence<state.sequence)return;
  if(event.type==='ROOM_STATE'){
   const s=event.payload;if(s.roomCode!==state.roomCode||s.sequence<state.sequence)return;
   const teams=mapTeams(s),players=s.players.map(p=>mapPlayer(p,s));
   const playerChanged=s.activePlayerId!==state.activePlayer?.id;
   set({snapshot:s,sequence:s.sequence,auctionStatus:s.status==='RUNNING'?'LIVE':s.status,teams,players,
    activePlayer:players.find(p=>p.id===s.activePlayerId)??null,currentBid:s.currentBidCr??0,
    highestBidder:teams.find(t=>t.id===s.highestBidderTeamId)??null,minimumNextBid:s.minimumNextBidCr??0,
    maximumPermittedBid:s.maximumPermittedBidCr,endsAt:s.endsAt,remainingTimeMs:s.remainingTimeMs,
    serverTimeOffset:event.serverTime-Date.now(),currentPot:s.activePotId??'',
    ...(playerChanged?{aiSuggestion:null,recentBids:[]}:{})});
   useRoomStore.getState().applySnapshot(s);
   clearTimeout(recommendationTimer);
   if(s.activePlayerId){
    recommendationTimer=setTimeout(()=>{void auctionService.recommendation(s.roomCode).then(r=>{
     if(get().snapshot?.activePlayerId===r.playerId&&get().sequence===r.sequence)set({aiSuggestion:mapRecommendation(r)});
    }).catch(()=>{if(get().roomCode===s.roomCode)set({aiSuggestion:null});});},350);
   }
  }else if(event.type==='PRESENCE_UPDATED'&&state.snapshot){
   const s={...state.snapshot,connectedUsers:event.payload.connectedUsers};
   set({snapshot:s,teams:mapTeams(s)});useRoomStore.getState().applySnapshot(s);
  }else if(event.type==='BID_UPDATED'){
   const team=state.teams.find(t=>t.id===event.payload.highestBidderTeamId);
   if(team)set({recentBids:[{id:String(event.sequence),amount:event.payload.amountCr,teamId:team.id,teamName:team.name,teamShortName:team.shortName,teamLogo:team.logo,bidderId:team.managerId,bidderUsername:team.managerUsername,timestamp:event.serverTime},...state.recentBids].slice(0,20)});
  }else if(event.type==='PLAYER_STARTED'){
   set({soldOverlay:initial.soldOverlay,unsoldOverlay:initial.unsoldOverlay,bidErrorNotice:null,antiSnipingNotice:null});
  }else if(event.type==='PLAYER_SOLD'){
   set({soldOverlay:{active:true,player:state.players.find(p=>p.id===event.payload.playerId)??null,winningTeam:state.teams.find(t=>t.id===event.payload.teamId)??null,price:event.payload.priceCr}});
  }else if(event.type==='PLAYER_UNSOLD'){
   set({unsoldOverlay:{active:true,player:state.players.find(p=>p.id===event.payload.playerId)??null,recallCount:(state.snapshot?.unsoldPlayers.length??0)+1}});
  }else if(event.type==='TIMER_EXTENDED'){
   const added=Math.max(0,Math.round((event.payload.endsAt-(state.endsAt??event.payload.endsAt))/1000));
   set({antiSnipingNotice:{active:true,secondsAdded:added,message:'Deadline extended by the server'}});
   clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>set({antiSnipingNotice:null}),3500);
  }else if(event.type==='BID_REJECTED'||event.type==='ERROR')set({bidErrorNotice:event.payload.message});
 },
 placeBid:amount=>{
  const s=get().snapshot;if(!s?.activePlayerId)return;
  try{croreToUnits(amount);}catch(e){set({bidErrorNotice:normalizeError(e).message});return;}
  void webSocketService.send({type:'PLACE_BID',payload:{roomCode:s.roomCode,amountCr:amount,playerId:s.activePlayerId}}).catch(e=>set({bidErrorNotice:normalizeError(e).message}));
 },
 hostCommand:async type=>{
  const code=get().roomCode;if(!code)return;
  try{await webSocketService.send({type,payload:{roomCode:code}});}catch(e){set({bidErrorNotice:normalizeError(e).message});throw e;}
 },
 hostPause:()=>{void get().hostCommand('PAUSE_AUCTION').catch(()=>{});},
 hostResume:()=>{void get().hostCommand('RESUME_AUCTION').catch(()=>{});},
 hostSkip:()=>{void get().hostCommand(get().activePlayer?'MARK_UNSOLD':'NEXT_PLAYER').catch(()=>{});},
 hostEnd:()=>{void get().hostCommand('END_AUCTION').catch(()=>{});},
 clearBidError:()=>set({bidErrorNotice:null}),clearAntiSnipingNotice:()=>set({antiSnipingNotice:null}),
 dismissSoldOverlay:()=>set({soldOverlay:initial.soldOverlay}),dismissUnsoldOverlay:()=>set({unsoldOverlay:initial.unsoldOverlay}),
}));
