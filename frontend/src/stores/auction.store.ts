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
import { FRESH_ANNOUNCEMENT_MS,fromCompletion,fromTurn,loadSeen,saveSeen,trimSeen,type RetentionAnnouncement } from '@/lib/retention-announcements';
/** Live activity line. Filled only from backend-confirmed events. */
export interface ActivityEntry {id:string;kind:'BID'|'SOLD'|'UNSOLD'|'SQUAD'|'RETENTION';at:number;teamName?:string;playerName?:string;amountCr?:number;detail?:string}
export interface SoldOverlayState {active:boolean;player:Player|null;winningTeam:Team|null;price:number}
export interface UnsoldOverlayState {active:boolean;player:Player|null;recallCount:number;reason?:'UNANIMOUS_SKIP'}
export interface AntiSnipingNotice {active:boolean;secondsAdded:number;message:string}
interface Store{
 roomCode:string|null;snapshot:RoomStateDTO|null;sequence:number;auctionStatus:string;activePlayer:Player|null;
 currentBid:number;highestBidder:Team|null;endsAt:number|null;remainingTimeMs:number|null;serverTimeOffset:number;
 minimumNextBid:number;maximumPermittedBid:number;currentPot:string;teams:Team[];players:Player[];recentBids:Bid[];aiSuggestion:AISuggestion|null;
 skipVoteNotice:string|null;soldOverlay:SoldOverlayState;unsoldOverlay:UnsoldOverlayState;antiSnipingNotice:AntiSnipingNotice|null;bidErrorNotice:string|null;
 retentionAnnouncement:RetentionAnnouncement|null;retentionQueue:RetentionAnnouncement[];retentionSeen:string[];activityFeed:ActivityEntry[];
 dismissRetentionAnnouncement:()=>void;
 initAuction:(code:string)=>void;leaveAuction:()=>void;handleServerEvent:(e:ServerEvent)=>void;
 placeBid:(amount:number)=>void;hostCommand:(type:HostCommand)=>Promise<void>;hostPause:()=>void;hostResume:()=>void;hostSkip:()=>void;hostEnd:()=>void;
 clearBidError:()=>void;clearAntiSnipingNotice:()=>void;dismissSoldOverlay:()=>void;dismissUnsoldOverlay:()=>void;
}
let unsubscribe:(()=>void)|undefined;let generation=0;
let recommendationTimer:ReturnType<typeof setTimeout>|undefined;
let noticeTimer:ReturnType<typeof setTimeout>|undefined;
let seenLoadedKey:string|null=null;
const FEED_LIMIT=60;
const initial={
 retentionAnnouncement:null,retentionQueue:[] as RetentionAnnouncement[],retentionSeen:[] as string[],activityFeed:[] as ActivityEntry[],
 skipVoteNotice:null,roomCode:null,snapshot:null,sequence:0,auctionStatus:'LOBBY',activePlayer:null,currentBid:0,highestBidder:null,endsAt:null,
 remainingTimeMs:null,serverTimeOffset:0,minimumNextBid:0,maximumPermittedBid:0,currentPot:'',teams:[],players:[],recentBids:[],aiSuggestion:null,
 soldOverlay:{active:false,player:null,winningTeam:null,price:0},unsoldOverlay:{active:false,player:null,recallCount:0},antiSnipingNotice:null,bidErrorNotice:null,
};
const feedWith=(feed:ActivityEntry[],entry:ActivityEntry)=>feed.some(e=>e.id===entry.id)?feed:[entry,...feed].slice(0,FEED_LIMIT);
/** Show an announcement once per backend event id; ids are remembered per room and user across refreshes. */
function offerAnnouncement(a:RetentionAnnouncement){
 const s=useAuctionStore.getState();
 if(s.retentionSeen.includes(a.id))return;
 const seen=trimSeen([...s.retentionSeen,a.id]);
 const uid=s.snapshot?.currentUserTeam.userId;if(s.roomCode&&uid)saveSeen(s.roomCode,uid,seen);
 if(s.retentionAnnouncement)useAuctionStore.setState({retentionSeen:seen,retentionQueue:[...s.retentionQueue,a]});
 else useAuctionStore.setState({retentionSeen:seen,retentionAnnouncement:a});
}
function markSeen(id:string){
 const s=useAuctionStore.getState();if(s.retentionSeen.includes(id))return;
 const seen=trimSeen([...s.retentionSeen,id]);
 const uid=s.snapshot?.currentUserTeam.userId;if(s.roomCode&&uid)saveSeen(s.roomCode,uid,seen);
 useAuctionStore.setState({retentionSeen:seen});
}
/** ROOM_STATE carries the persisted turns: recent unseen ones are announced, old ones are only remembered. */
function syncAnnouncements(s:RoomStateDTO,serverTime:number){
 const key=s.roomCode+':'+s.currentUserTeam.userId;
 if(seenLoadedKey!==key){
  seenLoadedKey=key;
  const stored=loadSeen(s.roomCode,s.currentUserTeam.userId);
  useAuctionStore.setState(c=>({retentionSeen:trimSeen([...new Set([...stored,...c.retentionSeen])])}));
 }
 const r=s.retention;if(!r)return;
 const all=[...r.turns.map(fromTurn),...(r.completion?[fromCompletion(r.completion)]:[])].sort((a,b)=>a.at-b.at);
 for(const a of all){
  if(useAuctionStore.getState().retentionSeen.includes(a.id))continue;
  if(serverTime-a.at<FRESH_ANNOUNCEMENT_MS)offerAnnouncement(a);else markSeen(a.id);
 }
}
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
 leaveAuction:()=>{generation++;unsubscribe?.();unsubscribe=undefined;clearTimeout(recommendationTimer);clearTimeout(noticeTimer);webSocketService.disconnect();seenLoadedKey=null;set(initial);useRoomStore.getState().reset();},
 dismissRetentionAnnouncement:()=>{const s=get();const [next,...rest]=s.retentionQueue;set({retentionAnnouncement:next??null,retentionQueue:rest});},
 handleServerEvent:event=>{
  const state=get();
  if(event.roomId&&state.snapshot&&event.roomId!==state.snapshot.roomId)return;
  if(event.roomId&&event.sequence<state.sequence)return;
  if(event.type==='ROOM_STATE'){
   const s=event.payload;if(s.roomCode!==state.roomCode||s.sequence<state.sequence)return;
   const teams=mapTeams(s),players=s.players.map(p=>mapPlayer(p,s));
   const playerChanged=s.activePlayerId!==state.activePlayer?.id || s.activationId!==state.snapshot?.activationId;
   set({snapshot:s,sequence:s.sequence,auctionStatus:s.status==='RUNNING'?'LIVE':s.status,teams,players,
    activePlayer:players.find(p=>p.id===s.activePlayerId)??null,currentBid:s.currentBidCr??0,
    highestBidder:teams.find(t=>t.id===s.highestBidderTeamId)??null,minimumNextBid:s.minimumNextBidCr??0,
    maximumPermittedBid:s.maximumPermittedBidCr,endsAt:s.endsAt,remainingTimeMs:s.remainingTimeMs,
    serverTimeOffset:event.serverTime-Date.now(),currentPot:s.activePotId??'',
    ...(playerChanged?{aiSuggestion:null,recentBids:[],skipVoteNotice:null}:{})});
   useRoomStore.getState().applySnapshot(s);
   syncAnnouncements(s,event.serverTime);
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
   if(team)set({recentBids:[{id:String(event.sequence),amount:event.payload.amountCr,teamId:team.id,teamName:team.name,teamShortName:team.shortName,teamLogo:team.logo,bidderId:team.managerId,bidderUsername:team.managerUsername,timestamp:event.serverTime},...state.recentBids].slice(0,20),
    activityFeed:feedWith(state.activityFeed,{id:event.sequence+'-bid',kind:'BID',at:event.serverTime,teamName:team.name,playerName:state.players.find(p=>p.id===event.payload.playerId)?.name,amountCr:event.payload.amountCr})});
  }else if(event.type==='SKIP_VOTE_UPDATED'){
   if(event.payload.reason==='BID_ACCEPTED')set({skipVoteNotice:'Skip votes reset after a valid bid.'});
  }else if(event.type==='PLAYER_STARTED'){
   set({skipVoteNotice:null});
   set({soldOverlay:initial.soldOverlay,unsoldOverlay:initial.unsoldOverlay,bidErrorNotice:null,antiSnipingNotice:null});
  }else if(event.type==='PLAYER_SOLD'){
   const soldPlayer=state.players.find(p=>p.id===event.payload.playerId)??null,soldTeam=state.teams.find(t=>t.id===event.payload.teamId)??null;
   let feed=feedWith(state.activityFeed,{id:event.sequence+'-sold',kind:'SOLD',at:event.serverTime,teamName:soldTeam?.name,playerName:soldPlayer?.name,amountCr:event.payload.priceCr});
   feed=feedWith(feed,{id:event.sequence+'-squad',kind:'SQUAD',at:event.serverTime,teamName:soldTeam?.name,playerName:soldPlayer?.name,detail:'Squad size '+event.payload.teamPlayerCount});
   set({activityFeed:feed,soldOverlay:{active:true,player:soldPlayer,winningTeam:soldTeam,price:event.payload.priceCr}});
  }else if(event.type==='PLAYER_UNSOLD'){
   const unsoldPlayer=state.players.find(p=>p.id===event.payload.playerId)??null;
   set({activityFeed:feedWith(state.activityFeed,{id:event.sequence+'-unsold',kind:'UNSOLD',at:event.serverTime,playerName:unsoldPlayer?.name}),
    unsoldOverlay:{active:true,player:unsoldPlayer,recallCount:(state.snapshot?.unsoldPlayers.length??0)+1,reason:event.payload.reason}});
  }else if(event.type==='RETENTION_TEAM_CONFIRMED'){
   offerAnnouncement(fromTurn(event.payload));
   const t=event.payload;
   set({activityFeed:feedWith(get().activityFeed,{id:event.sequence+'-retention',kind:'RETENTION',at:t.at,teamName:t.teamName,detail:t.kind==='SKIPPED'?'skipped retention':'retained '+t.players.map(p=>p.name).join(', ')})});
  }else if(event.type==='RETENTION_ALL_COMPLETED'){
   offerAnnouncement(fromCompletion(event.payload));
  }else if(event.type==='RETENTION_RESET'){
   set({retentionAnnouncement:null,retentionQueue:[]});
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
