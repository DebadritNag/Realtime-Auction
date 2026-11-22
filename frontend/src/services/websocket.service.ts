import { authService } from './auth.service';
import { ApiError } from './api';
import { parseServerEvent,type ServerEvent,type ClientCommand } from '@/types/backend';
import { useConnectionStore } from '@/stores/connection.store';
type Pending={resolve:()=>void;reject:(e:ApiError)=>void;timer:ReturnType<typeof setTimeout>};
/** After this many consecutive failed attempts the client stops and offers a manual "Reconnect to Auction". */
export const MAX_ATTEMPTS=8;
const PING_MS=20000,SILENCE_MS=55000,MIN_DELAY_MS=500,MAX_DELAY_MS=30000;
/** Full-jitter backoff: random(0, min(30 s, 1 s * 2^attempt)) with a 500 ms floor. */
export const backoffDelay=(attempt:number)=>Math.max(MIN_DELAY_MS,Math.random()*Math.min(MAX_DELAY_MS,1000*2**attempt));
export class WebSocketService {
 private socket:WebSocket|null=null;
 private listeners=new Set<(event:ServerEvent)=>void>();
 private pending=new Map<string,Pending>();
 private retry:ReturnType<typeof setTimeout>|undefined;
 private syncTimeout:ReturnType<typeof setTimeout>|undefined;
 private heartbeat:ReturnType<typeof setInterval>|undefined;
 private detach:(()=>void)|undefined;
 private generation=0;private attempts=0;private room:string|null=null;private manual=true;
 private recovering=false;private terminal=false;private lastFrame=0;
 private connectionId:string|undefined;
 private dispatch(event:ServerEvent){
  let failed=false;
  for(const listener of this.listeners){try{listener(event);}catch{failed=true;console.warn('realtime_subscriber_failed',{connectionId:this.connectionId,eventType:event.type,incomingSequence:event.sequence});}}
  if(failed&&event.type!=='ERROR')for(const listener of this.listeners){try{listener({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'SUBSCRIBER_ERROR',message:'Synchronizing latest state…'}});}catch{/* Isolate a broken subscriber. */}}
 }
 subscribe(listener:(event:ServerEvent)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 connectManager(id?:string){this.connect('@manager:'+ (id??''));}
 connect(roomCode:string){
  if(this.room===roomCode&&!this.manual)return;
  this.disconnect();this.room=roomCode;this.manual=false;this.attempts=0;this.recovering=false;this.terminal=false;
  this.listen();void this.open(this.generation);
 }
 /** Manual retry after LOST / AUTH_EXPIRED. Resets the attempt counter. */
 reconnect(){
  if(!this.room||this.manual)return;
  clearTimeout(this.retry);clearTimeout(this.syncTimeout);this.stopHeartbeat();
  const old=this.socket;this.socket=null;this.generation++;
  try{old?.close();}catch{/* already closed */}
  this.rejectPending();this.attempts=0;this.terminal=false;this.recovering=true;void this.open(this.generation);
 }
 private listen(){
  if(this.detach||typeof window==='undefined')return;
  const kick=()=>this.kick();
  const visible=()=>{if(typeof document==='undefined'||document.visibilityState==='visible')kick();};
  window.addEventListener('online',kick);window.addEventListener('pageshow',kick);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',visible);
  this.detach=()=>{window.removeEventListener('online',kick);window.removeEventListener('pageshow',kick);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);};
 }
 /** Immediate attempt when the network or tab returns. A superseded session is never retried automatically. */
 private kick(){
  if(this.manual||this.terminal||!this.room)return;
  if(this.socket){this.checkSilence();return;}
  const status=useConnectionStore.getState().status;
  if(status==='SYNCED')return;
  clearTimeout(this.retry);
  if(status==='LOST')this.attempts=0;
  this.recovering=true;void this.open(this.generation);
 }
 private checkSilence(){
  const socket=this.socket;
  if(socket&&useConnectionStore.getState().status==='SYNCED'&&Date.now()-this.lastFrame>SILENCE_MS){
   try{socket.close();}catch{/* already closed */}
   this.closed(this.generation,socket,undefined);
  }
 }
 private startHeartbeat(socket:WebSocket){
  this.stopHeartbeat();this.lastFrame=Date.now();
  this.heartbeat=setInterval(()=>{
   if(socket!==this.socket||socket.readyState!==WebSocket.OPEN)return;
   this.checkSilence();if(socket!==this.socket)return;
   try{socket.send(JSON.stringify({type:'PING',requestId:crypto.randomUUID()}));}catch{/* close handler recovers */}
  },PING_MS);
 }
 private stopHeartbeat(){clearInterval(this.heartbeat);this.heartbeat=undefined;}
 private expired(){this.terminal=true;useConnectionStore.getState().setStatus('AUTH_EXPIRED');}
 private closed(generation:number,socket:WebSocket,code:number|undefined){
  if(generation!==this.generation||socket!==this.socket)return;
  clearTimeout(this.syncTimeout);this.stopHeartbeat();this.socket=null;this.rejectPending();
  if(code===4003){this.terminal=true;this.recovering=true;useConnectionStore.getState().setStatus('LOST');return;}
  if(code===4001){
   // Try a fresh token once; without a session the user must sign in again.
   void authService.getAccessToken().then(token=>{
    if(generation!==this.generation)return;
    if(token)this.schedule(generation);else this.expired();
   },()=>{if(generation===this.generation)this.expired();});
   return;
  }
  this.schedule(generation);
 }
 private async open(generation:number){
  if(this.manual||generation!==this.generation)return;
  const store=useConnectionStore.getState();
  store.setStatus(this.recovering||this.attempts?'RECONNECTING':'CONNECTING');store.setAttempt(this.attempts);
  try{
   const token=await authService.getAccessToken();
   if(this.manual||generation!==this.generation)return;
   if(!token){
    this.expired();
    this.dispatch({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'UNAUTHENTICATED',message:'Your session expired. Sign in again to rejoin your auction.'}});
    return;
   }
   const base=process.env.NEXT_PUBLIC_WS_URL;if(!base)throw new ApiError('WebSocket URL is not configured.','CONFIGURATION_ERROR');
   // The token travels only in the subprotocol header, never in the URL.
   const socket=new WebSocket(base,['auction.v1','bearer.'+token]);this.socket=socket;
   // 45 s gives Render's cold-start enough time to send ROOM_STATE.
   // On a warm instance the first ROOM_STATE usually arrives in < 2 s.
   this.syncTimeout=setTimeout(()=>{try{socket.close();}catch{/* already closed */}this.closed(generation,socket,undefined);},45000);
   socket.onopen=()=>{
    if(generation!==this.generation)return socket.close();
    useConnectionStore.getState().setStatus('CONNECTED');
    socket.send(JSON.stringify(this.room?.startsWith('@manager:') ? {type:'SUBSCRIBE_MANAGER_MODE',requestId:crypto.randomUUID(),payload:{deltaUpdates:true,...(this.room.slice(9)?{tournamentId:this.room.slice(9)}:{})}} : {type:'REJOIN_ROOM',requestId:crypto.randomUUID(),payload:{roomCode:this.room}}));
   };
   socket.onmessage=message=>{
    if(generation!==this.generation||socket!==this.socket)return;
    this.lastFrame=Date.now();
    let event:ServerEvent|null;
    try{event=parseServerEvent(String(message.data));}
    catch{console.warn('realtime_invalid_message',{connectionId:this.connectionId,payloadBytes:new Blob([String(message.data)]).size,serverTime:Date.now()});this.dispatch({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'INVALID_RESPONSE',message:'Synchronizing latest state…'}});return;}
    if(!event)return;
    if(event.type==='CONNECTED')this.connectionId=event.payload.connectionId;
     if((event.type==='ROOM_STATE'&&event.payload.roomCode===this.room)||(event.type==='MANAGER_MODE_STATE'&&this.room==='@manager:'+event.payload.id)||(event.type==='MANAGER_MODE_INBOX'&&this.room==='@manager:')){
      clearTimeout(this.syncTimeout);this.attempts=0;this.recovering=false;useConnectionStore.getState().setStatus('SYNCED');useConnectionStore.getState().setAttempt(0);this.startHeartbeat(socket);
     }
     const pending=event.requestId?this.pending.get(event.requestId):undefined;
     if(pending&&(event.type==='COMMAND_ACK'||event.type==='ERROR'||event.type==='BID_REJECTED')){
      clearTimeout(pending.timer);this.pending.delete(event.requestId!);
      if(event.type==='COMMAND_ACK')pending.resolve();else pending.reject(new ApiError(event.payload.message,event.payload.reason));
     }
     this.dispatch(event);
     if(event.type==='ERROR'&&['NOT_ROOM_MEMBER','ROOM_NOT_FOUND'].includes(event.payload.reason))this.disconnect();
   };
   socket.onerror=()=>{/* onclose handles reconnection; never fall back to simulated state */};
   socket.onclose=(ev?:CloseEvent)=>this.closed(generation,socket,ev?.code);
  }catch(error){
   if(generation!==this.generation)return;
   this.dispatch({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'CONNECTION_ERROR',message:error instanceof Error?error.message:'Connection failed.'}});
   this.schedule(generation);
  }
 }
 private schedule(generation:number){
  if(this.manual||generation!==this.generation)return;
  clearTimeout(this.retry);
  this.recovering=true;
  if(this.attempts>=MAX_ATTEMPTS){useConnectionStore.getState().setStatus('LOST');return;}
  useConnectionStore.getState().setStatus('RECONNECTING');
  const delay=backoffDelay(this.attempts++);
  this.retry=setTimeout(()=>{void this.open(generation);},delay);
 }
 private rejectPending(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new ApiError('Connection interrupted. Check synchronized state before bidding again.','CONNECTION_LOST'));}this.pending.clear();}
 disconnect(){
  this.manual=true;this.generation++;clearTimeout(this.retry);clearTimeout(this.syncTimeout);this.stopHeartbeat();
  this.detach?.();this.detach=undefined;this.terminal=false;this.recovering=false;
  this.socket?.close();this.socket=null;this.room=null;this.rejectPending();
  useConnectionStore.getState().setStatus('DISCONNECTED');
 }
 requestManagerState(id:string){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'SUBSCRIBE_MANAGER_MODE',payload:{tournamentId:id,deltaUpdates:true}}));}
 refreshAuth(){const room=this.room;if(room){this.disconnect();this.connect(room);}}
 send(command:ClientCommand):Promise<void>{
  const socket=this.socket;
  const status=useConnectionStore.getState().status;
  if(!socket||socket.readyState!==WebSocket.OPEN||status!=='SYNCED'){
   const msg=status==='CONNECTING'||status==='RECONNECTING'
    ?'Still connecting to the auction server — please wait a moment.'
    :'Not connected to the auction. Refresh the page if this persists.';
   return Promise.reject(new ApiError(msg,'NOT_CONNECTED'));
  }
  const requestId=command.requestId??crypto.randomUUID();
  if(['REQUEST_STATE','PING','JOIN_ROOM','REJOIN_ROOM'].includes(command.type)){socket.send(JSON.stringify({...command,requestId}));return Promise.resolve();}
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new ApiError('Server did not confirm your action — please check the current state before retrying.','COMMAND_TIMEOUT'));void this.send({type:'REQUEST_STATE',payload:{roomCode:this.room!}}).catch(()=>{});},20000);
   this.pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({...command,requestId}));
  });
 }
}
export const webSocketService=new WebSocketService();
