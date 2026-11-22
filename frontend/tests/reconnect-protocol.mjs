/** Protocol test for the resilient socket client and the auction store sequence rules (no browser, fake clock). */
import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=await build({stdin:{contents:`
export {WebSocketService,backoffDelay,MAX_ATTEMPTS} from './src/services/websocket.service';
export {useConnectionStore} from './src/stores/connection.store';
export {useAuctionStore} from './src/stores/auction.store';
export {initialServer,project} from './tests/retention-fixtures.mjs';`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':root+'src'},define:{'process.env.NEXT_PUBLIC_WS_URL':'"ws://test/ws"'},
 plugins:[{name:'auth',setup(b){b.onResolve({filter:/auth\.service$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const authService={getAccessToken:async()=>globalThis.__token,getSession:async()=>null};',loader:'js'}));}}]});
// Fake clock: timers only fire when the test advances time.
let now=1_000_000,seq=0,timers=[];
globalThis.setTimeout=(fn,ms=0)=>{const id=++seq;timers.push({id,at:now+ms,fn});return id;};
globalThis.setInterval=(fn,ms)=>{const id=++seq;timers.push({id,at:now+ms,fn,every:ms});return id;};
globalThis.clearTimeout=globalThis.clearInterval=id=>{timers=timers.filter(t=>t.id!==id);};
Date.now=()=>now;
const flush=()=>new Promise(r=>setImmediate(r));
async function advance(ms){
 const target=now+ms;
 for(;;){
  const next=timers.filter(t=>t.at<=target).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
  if(!next)break;
  now=next.at;if(next.every)next.at+=next.every;else timers=timers.filter(t=>t!==next);
  next.fn();await flush();
 }
 now=target;await flush();
}
const listeners={};
globalThis.window={addEventListener:(t,f)=>{(listeners[t]??=[]).push(f);},removeEventListener:(t,f)=>{listeners[t]=(listeners[t]??[]).filter(x=>x!==f);}};
globalThis.document={visibilityState:'visible',addEventListener:(t,f)=>{(listeners['doc:'+t]??=[]).push(f);},removeEventListener:(t,f)=>{listeners['doc:'+t]=(listeners['doc:'+t]??[]).filter(x=>x!==f);}};
const fire=(t)=>{for(const f of [...(listeners[t]??[])])f();};
const sockets=[];
globalThis.WebSocket=class{static OPEN=1;readyState=1;sent=[];constructor(url,protocols){this.url=String(url);this.protocols=protocols;sockets.push(this);}send(d){this.sent.push(JSON.parse(d));}close(){this.readyState=3;}};
const module={exports:{}};new Function('module','exports',output.outputFiles[0].text)(module,module.exports);
const {WebSocketService,backoffDelay,MAX_ATTEMPTS,useConnectionStore,useAuctionStore,initialServer,project}=module.exports;
const status=()=>useConnectionStore.getState().status;
const ROOM='ABC234';
const roomFrame=(sequence=1)=>({data:JSON.stringify({type:'ROOM_STATE',sequence,serverTime:now,roomId:'room-1',payload:project(initialServer(),'t1','t1',{sequence,serverTime:now})})});
const sockClose=(s,code=1006)=>{s.readyState=3;s.onclose({code});};
async function fresh(){
 for(const s of sockets)s.readyState=3;sockets.length=0;timers=[];globalThis.__token='tok';
 useConnectionStore.setState({status:'DISCONNECTED',attempt:0,lostSince:null,reconnectedAt:null});
 const service=new WebSocketService();service.connect(ROOM);await flush();return service;
}
const synced=async(service)=>{const s=sockets.at(-1);s.onopen();s.onmessage(roomFrame());await flush();assert.equal(status(),'SYNCED');return s;};

// 1. Subprotocol auth, no token in the URL.
{
 const service=await fresh();assert.equal(sockets.length,1);
 assert.equal(sockets[0].url,'ws://test/ws');assert.ok(!sockets[0].url.includes('token'));
 assert.deepEqual(sockets[0].protocols,['auction.v1','bearer.tok']);service.disconnect();
}
// 2. Backoff bounds, 8-attempt give-up, manual reconnect.
{
 for(let n=0;n<10;n++){const hi=Math.min(30000,1000*2**n);Math.random=()=>0;assert.equal(backoffDelay(n),500);Math.random=()=>0.999999;const d=backoffDelay(n);assert.ok(d>=500&&d<=hi,'delay '+d+' for attempt '+n);}
 Math.random=()=>0.999999;
 const service=await fresh();
 for(let n=0;n<MAX_ATTEMPTS;n++){
  const before=sockets.length;sockClose(sockets.at(-1));
  assert.equal(status(),'RECONNECTING');
  const timer=timers.find(t=>!t.every);const delay=timer.at-now;
  assert.ok(delay>=500&&delay<=Math.min(30000,1000*2**n),'attempt '+n+' delay '+delay);
  await advance(delay);assert.equal(sockets.length,before+1);
 }
 sockClose(sockets.at(-1));assert.equal(status(),'LOST');
 const count=sockets.length;await advance(300000);assert.equal(sockets.length,count,'no automatic attempts after LOST');
 service.reconnect();await flush();assert.equal(sockets.length,count+1);assert.equal(status(),'RECONNECTING');assert.equal(useConnectionStore.getState().attempt,0);
 await synced(service);assert.ok(useConnectionStore.getState().reconnectedAt>0,'recovery is recorded');
 service.disconnect();
}
// 3. online / visibility trigger an immediate attempt; listeners removed on disconnect.
{
 const service=await fresh();const s=await synced(service);sockClose(s);const n=sockets.length;
 assert.equal(status(),'RECONNECTING');fire('online');await flush();assert.equal(sockets.length,n+1,'online reconnects without waiting');
 sockClose(sockets.at(-1));const m=sockets.length;fire('doc:visibilitychange');await flush();assert.equal(sockets.length,m+1,'visible tab reconnects');
 service.disconnect();assert.equal((listeners.online??[]).length,0);assert.equal((listeners['doc:visibilitychange']??[]).length,0);
}
// 4. App-level heartbeat and 55 s watchdog.
{
 const service=await fresh();const s=await synced(service);
 for(let i=0;i<5;i++){await advance(20000);s.onmessage({data:JSON.stringify({type:'PONG',sequence:0,serverTime:now,payload:{}})});}
 assert.ok(s.sent.filter(m=>m.type==='PING').length>=4,'PING sent every 20 s');
 assert.equal(sockets.length,1,'answered pings keep the socket');
 await advance(40000);assert.equal(sockets.length,1,'40 s of silence is tolerated');
 await advance(20000);assert.equal(status(),'RECONNECTING','55 s of silence forces a reconnect');await advance(2000);assert.equal(sockets.length,2);
 service.disconnect();
}
// 5. Close code 4001: fresh token retries; no session -> AUTH_EXPIRED without retry.
{
 const service=await fresh();let s=await synced(service);sockClose(s,4001);await flush();assert.equal(status(),'RECONNECTING');
 await advance(2000);assert.equal(sockets.length,2);
 globalThis.__token=null;s=sockets.at(-1);sockClose(s,4001);await flush();assert.equal(status(),'AUTH_EXPIRED');
 await advance(300000);assert.equal(sockets.length,2,'no retry after AUTH_EXPIRED');service.disconnect();
}
// 6. Close code 4003 -> LOST and never auto-retried, even on online.
{
 const service=await fresh();const s=await synced(service);sockClose(s,4003);await flush();assert.equal(status(),'LOST');
 await advance(300000);fire('online');await flush();assert.equal(sockets.length,1);service.disconnect();
}
// 7. Unconfirmed commands are rejected on disconnect and never applied.
{
 const service=await fresh();const s=await synced(service);
 const before=useAuctionStore.getState().sequence;
 const result=service.send({type:'PLACE_BID',payload:{roomCode:ROOM,amountCr:5}}).then(()=>'ok',e=>e.code);
 await flush();assert.equal(s.sent.filter(m=>m.type==='PLACE_BID').length,1);
 sockClose(s);assert.equal(await result,'CONNECTION_LOST');assert.equal(useAuctionStore.getState().sequence,before);
 await assert.rejects(service.send({type:'PLACE_BID',payload:{roomCode:ROOM,amountCr:6}}));service.disconnect();
}
// 8. Store sequence rules and snapshot-derived activity.
{
 const server=initialServer();
 const state=(sequence,extra={})=>({...project(server,'t1','t1',{sequence}),serverTime:now,...extra});
 const push=(s)=>useAuctionStore.getState().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:'room-1',sequence:s.sequence,serverTime:now});
 const ev=(type,payload,sequence)=>useAuctionStore.getState().handleServerEvent({type,payload,roomId:'room-1',sequence,serverTime:now});
 const store=()=>useAuctionStore.getState();
 useAuctionStore.setState({roomCode:ROOM});
 const act=[{id:'b2',kind:'BID',at:2,teamName:'Alpha FC',amountCr:8},{id:'b1',kind:'BID',at:1,teamName:'Beta FC',amountCr:6}];
 push(state(10,{activity:act,recentBids:[{id:'b2',teamId:'t1',teamName:'Alpha FC',amountCr:8,at:2}]}));
 assert.equal(store().sequence,10);assert.equal(store().activityFeed.length,2);assert.equal(store().recentBids[0].amount,8);
 push(state(10,{activity:act}));push(state(10,{activity:act}));
 assert.deepEqual(store().activityFeed.map(e=>e.id),['b2','b1'],'no duplicates after repeated ROOM_STATE');
 push(state(9,{maximumPermittedBidCr:1}));assert.equal(store().sequence,10);assert.notEqual(store().maximumPermittedBid,1,'stale ROOM_STATE ignored');
 const bid={playerId:'p',amountCr:9,highestBidderTeamId:'t2'};
 const bids=()=>store().recentBids.length;const b0=bids();
 ev('BID_UPDATED',bid,10);assert.equal(bids(),b0,'equal-sequence event ignored');
 ev('BID_UPDATED',bid,9);assert.equal(bids(),b0,'older event ignored');
 ev('BID_UPDATED',bid,11);assert.equal(bids(),b0+1,'newer event applied');
 ev('PRESENCE_UPDATED',{connectedUsers:['u1'],teamPresence:[{teamId:'t2',managerUsername:'m',connected:false,lastSeenAt:5}]},11);
 assert.equal(store().snapshot.teamPresence[0].connected,false,'PRESENCE_UPDATED applies at an equal sequence');
 push(state(11,{activity:[{id:'x1',kind:'SOLD',at:3,teamName:'Alpha FC',playerName:'P',amountCr:9},...act]}));
 assert.deepEqual(store().activityFeed.map(e=>e.id),['x1','b2','b1'],'feed is replaced by the snapshot');
}
console.log('PASS: subprotocol auth, jittered backoff, give-up and manual reconnect, online/visibility triggers, heartbeat and watchdog, 4001/4003 handling, rejected pending commands, store sequence and feed rules.');
