import { create } from 'zustand';
export type ConnectionStateStatus='CONNECTING'|'CONNECTED'|'SYNCED'|'RECONNECTING'|'DISCONNECTED';
export const useConnectionStore=create<{
 status:ConnectionStateStatus;latencyMs:number|null;lastHeartbeat:number|null;
 setStatus:(status:ConnectionStateStatus)=>void;
}>(set=>({status:'DISCONNECTED',latencyMs:null,lastHeartbeat:null,setStatus:status=>set({status,lastHeartbeat:Date.now()})}));
