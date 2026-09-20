import { authService } from './auth.service';
import { ApiError } from './api';
import { parseServerEvent,type ServerEvent,type ClientCommand } from '@/types/backend';
import { useConnectionStore } from '@/stores/connection.store';
type Pending={resolve:()=>void;reject:(e:ApiError)=>void;timer:ReturnType<typeof setTimeout>};
export class WebSocketService {
 private socket:WebSocket|null=null;
 private listeners=new Set<(event:ServerEvent)=>void>();
 private pending=new Map<string,Pending>();
 private retry:ReturnType<typeof setTimeout>|undefined;
 private syncTimeout:ReturnType<typeof setTimeout>|undefined;
 private generation=0;private attempts=0;private room:string|null=null;private manual=true;
 subscribe(listener:(event:ServerEvent)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 connect(roomCode:string){
  if(this.room===roomCode&&!this.manual)return;
  this.disconnect();this.room=roomCode;this.manual=false;this.attempts=0;void this.open(this.generation);
 }
 private async open(generation:number){
  if(this.manual||generation!==this.generation)return;
  useConnectionStore.getState().setStatus(this.attempts?'RECONNECTING':'CONNECTING');
  try{
   const token=await authService.getAccessToken();
   if(this.manual||generation!==this.generation)return;
   const base=process.env.NEXT_PUBLIC_WS_URL;if(!base)throw new ApiError('WebSocket URL is not configured.','CONFIGURATION_ERROR');
   const url=new URL(base);url.searchParams.set('token',token);
   const socket=new WebSocket(url);this.socket=socket;
   this.syncTimeout=setTimeout(()=>socket.close(),12000);
   socket.onopen=()=>{
    if(generation!==this.generation)return socket.close();
    useConnectionStore.getState().setStatus('CONNECTED');
    socket.send(JSON.stringify({type:'REJOIN_ROOM',requestId:crypto.randomUUID(),payload:{roomCode:this.room}}));
   };
   socket.onmessage=message=>{
    if(generation!==this.generation||socket!==this.socket)return;
    try{
     const event=parseServerEvent(String(message.data));
     if(event.type==='ROOM_STATE'&&event.payload.roomCode===this.room){
      clearTimeout(this.syncTimeout);this.attempts=0;useConnectionStore.getState().setStatus('SYNCED');
     }
     const pending=event.requestId?this.pending.get(event.requestId):undefined;
     if(pending&&(event.type==='COMMAND_ACK'||event.type==='ERROR'||event.type==='BID_REJECTED')){
      clearTimeout(pending.timer);this.pending.delete(event.requestId!);
      if(event.type==='COMMAND_ACK')pending.resolve();else pending.reject(new ApiError(event.payload.message,event.payload.reason));
     }
     for(const listener of this.listeners)listener(event);
     if(event.type==='ERROR'&&['NOT_ROOM_MEMBER','UNAUTHENTICATED','ROOM_NOT_FOUND'].includes(event.payload.reason))this.disconnect();
    }catch{for(const listener of this.listeners)listener({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'INVALID_RESPONSE',message:'Unable to read server state. Reconnect to synchronize.'}});}
   };
   socket.onerror=()=>{/* onclose handles reconnection; never fall back to simulated state */};
   socket.onclose=()=>{
    if(generation!==this.generation||socket!==this.socket)return;
    clearTimeout(this.syncTimeout);this.socket=null;this.rejectPending();
    this.schedule(generation);
   };
  }catch(error){
   if(generation!==this.generation)return;
   for(const listener of this.listeners)listener({type:'ERROR',sequence:0,serverTime:Date.now(),payload:{reason:'CONNECTION_ERROR',message:error instanceof Error?error.message:'Connection failed.'}});
   this.schedule(generation);
  }
 }
 private schedule(generation:number){
  if(this.manual)return;
  useConnectionStore.getState().setStatus('RECONNECTING');
  const delay=Math.min(1000*2**Math.min(this.attempts++,5),15000)+Math.random()*300;
  this.retry=setTimeout(()=>{void this.open(generation);},delay);
 }
 private rejectPending(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new ApiError('Connection interrupted. Check synchronized state before bidding again.','CONNECTION_LOST'));}this.pending.clear();}
 disconnect(){
  this.manual=true;this.generation++;clearTimeout(this.retry);clearTimeout(this.syncTimeout);
  this.socket?.close();this.socket=null;this.room=null;this.rejectPending();
  useConnectionStore.getState().setStatus('DISCONNECTED');
 }
 refreshAuth(){const room=this.room;if(room){this.disconnect();this.connect(room);}}
 send(command:ClientCommand):Promise<void>{
  const socket=this.socket;
  if(!socket||socket.readyState!==WebSocket.OPEN||useConnectionStore.getState().status!=='SYNCED')
   return Promise.reject(new ApiError('Wait until the room is synchronized.','NOT_CONNECTED'));
  const requestId=command.requestId??crypto.randomUUID();
  if(['REQUEST_STATE','PING','JOIN_ROOM','REJOIN_ROOM'].includes(command.type)){socket.send(JSON.stringify({...command,requestId}));return Promise.resolve();}
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new ApiError('Confirmation timed out. Refresh state before retrying.','COMMAND_TIMEOUT'));void this.send({type:'REQUEST_STATE',payload:{roomCode:this.room!}});},10000);
   this.pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({...command,requestId}));
  });
 }
}
export const webSocketService=new WebSocketService();
