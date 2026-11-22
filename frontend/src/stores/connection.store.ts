import { create } from 'zustand';
export type ConnectionStateStatus='CONNECTING'|'CONNECTED'|'SYNCED'|'RECONNECTING'|'DISCONNECTED'|'LOST'|'AUTH_EXPIRED';
export const useConnectionStore=create<{
 status:ConnectionStateStatus;latencyMs:number|null;lastHeartbeat:number|null;
 attempt:number;lostSince:number|null;reconnectedAt:number|null;
 setStatus:(status:ConnectionStateStatus)=>void;setAttempt:(attempt:number)=>void;
}>((set,get)=>({status:'DISCONNECTED',latencyMs:null,lastHeartbeat:null,attempt:0,lostSince:null,reconnectedAt:null,
 setAttempt:attempt=>set({attempt}),
 setStatus:status=>{
  const prev=get().status;const now=Date.now();
  const down=(s:ConnectionStateStatus)=>s==='RECONNECTING'||s==='LOST'||s==='AUTH_EXPIRED';
  const patch:{lostSince?:number|null;reconnectedAt?:number|null}={};
  if(status==='SYNCED'){patch.lostSince=null;if(down(prev)||get().lostSince)patch.reconnectedAt=now;}
  else if(down(status)){if(get().lostSince===null)patch.lostSince=now;patch.reconnectedAt=null;}
  else if(status==='DISCONNECTED'){patch.lostSince=null;patch.reconnectedAt=null;}
  set({status,lastHeartbeat:now,...patch});
 }}));
