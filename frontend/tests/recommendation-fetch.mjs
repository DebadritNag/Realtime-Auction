/** Recommendation fetching and room-missing separation (no browser, fake clock, mocked fetch). */
import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=await build({stdin:{contents:`
export {useAuctionStore} from './src/stores/auction.store';
export {useConnectionStore} from './src/stores/connection.store';
export {RecommendationFetcher,MAX_RATE_LIMIT_RETRIES} from './src/services/recommendation.service';
export {parseRetryAfter} from './src/services/api';
export {initialServer,project} from './tests/retention-fixtures.mjs';`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':root+'src'},
 define:{'process.env.NEXT_PUBLIC_WS_URL':'"ws://test/ws"','process.env.NEXT_PUBLIC_API_URL':'"https://backend.example"'},
 plugins:[{name:'auth',setup(b){b.onResolve({filter:/auth\.service$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const authService={getAccessToken:async()=>"tok",getSession:async()=>null};',loader:'js'}));}}]});
let now=1_000_000,seq=0,timers=[];
globalThis.setTimeout=(fn,ms=0)=>{const id=++seq;timers.push({id,at:now+ms,fn});return id;};
globalThis.setInterval=(fn,ms)=>{const id=++seq;timers.push({id,at:now+ms,fn,every:ms});return id;};
globalThis.clearTimeout=globalThis.clearInterval=id=>{timers=timers.filter(t=>t.id!==id);};
Date.now=()=>now;Math.random=()=>0;
const flush=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
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
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
globalThis.WebSocket=class{static OPEN=1;readyState=1;constructor(){}send(){}close(){this.readyState=3;}};
const module={exports:{}};new Function('module','exports',output.outputFiles[0].text)(module,module.exports);
const {useAuctionStore,RecommendationFetcher,MAX_RATE_LIMIT_RETRIES,parseRetryAfter,initialServer,project}=module.exports;
const ROOM='ABC234';
const store=()=>useAuctionStore.getState();
const rec={recommendedMinCr:5,recommendedMaxCr:9,suggestedCeilingCr:11,budgetRisk:'LOW',squadNeedScore:1,scarcityScore:1,reasons:['r'],warnings:[],sequence:1,playerId:'1'};
const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
let calls,recommendationHandler,stateHandler,signals;
globalThis.fetch=async(url,options)=>{
 if(String(url).endsWith('/recommendation')){calls.recommendation++;signals.push(options.signal);return recommendationHandler();}
 if(String(url).endsWith('/state')){calls.state++;return stateHandler();}
 throw new Error('unexpected '+url);
};
const running=(sequence,extra={})=>({...project(initialServer(),'t1','t1',{sequence,serverTime:now}),roomCode:ROOM,status:'RUNNING',activePlayerId:'1',activationId:'act-1',currentBidCr:5,...extra});
const push=s=>store().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:s.roomId,sequence:s.sequence,serverTime:now});
function fresh(){
 store().leaveAuction();timers=[];now+=2000;calls={recommendation:0,state:0};signals=[];
 recommendationHandler=async()=>json(200,rec);stateHandler=async()=>json(200,{});
 useAuctionStore.setState({roomCode:ROOM});
}
assert.equal(parseRetryAfter('7'),7000);assert.equal(parseRetryAfter(null),undefined);assert.equal(parseRetryAfter('garbage'),undefined);
assert.equal(parseRetryAfter(new Date(now+4000).toUTCString()),4000);

// 1. 50 identical ROOM_STATE events cause one request; a new bid or player causes one more; result is applied.
fresh();
for(let n=0;n<50;n++)push(running(1+n));
await advance(10);
assert.equal(calls.recommendation,1);assert.equal(store().recommendationStatus,'ready');assert.ok(store().aiSuggestion);
push(running(60,{currentBidCr:6}));await advance(10);
assert.equal(calls.recommendation,1,'throttled to one request per 1.5 s');
await advance(1600);assert.equal(calls.recommendation,2);
push(running(61,{currentBidCr:6,activationId:'act-2'}));await advance(1600);assert.equal(calls.recommendation,3);
// Not running: no request, panel idle.
push(running(62,{status:'PAUSED'}));await advance(5000);assert.equal(calls.recommendation,3);assert.equal(store().recommendationStatus,'idle');

// 2. A newer key aborts the older in-flight request and its late answer is ignored.
fresh();
{
 let release;recommendationHandler=()=>new Promise(r=>{release=()=>r(json(200,{...rec,playerId:'1'}));});
 push(running(1));await advance(10);assert.equal(calls.recommendation,1);
 push(running(2,{currentBidCr:7}));await advance(1600);
 assert.equal(signals[0].aborted,true,'obsolete request is aborted');
 release();await advance(10);
}

// 3. 429 with Retry-After: waits at least that long, at most 3 retries, then unavailable. Auction state untouched.
fresh();
{
 recommendationHandler=async()=>json(429,{error:{code:'RATE_LIMITED',message:'Request rejected.'}},{'retry-after':'5'});
 push(running(1));await advance(10);
 const before={snapshot:store().snapshot,endsAt:store().endsAt,bid:store().currentBid,player:store().activePlayer};
 assert.equal(calls.recommendation,1);
 await advance(4000);assert.equal(calls.recommendation,1,'honours Retry-After');
 await advance(1500);assert.equal(calls.recommendation,2);
 await advance(120000);
 assert.equal(calls.recommendation,1+MAX_RATE_LIMIT_RETRIES,'retries are capped');
 assert.equal(store().recommendationStatus,'unavailable');
 await advance(600000);assert.equal(calls.recommendation,1+MAX_RATE_LIMIT_RETRIES,'no infinite loop');
 assert.equal(store().roomMissing,false);assert.equal(store().bidErrorNotice,null);assert.equal(store().syncNotice,null);
 assert.equal(store().snapshot,before.snapshot);assert.equal(store().endsAt,before.endsAt);assert.equal(store().currentBid,before.bid);assert.equal(store().activePlayer,before.player);
 push(running(2));await advance(10);assert.equal(calls.recommendation,1+MAX_RATE_LIMIT_RETRIES,'unchanged key is not retried by new snapshots');
}

// 4. Recommendation 404 / 409 / 500 / network never mark the room missing or raise a bid error.
for(const [name,handler,expected] of [
 ['404',async()=>json(404,{error:{code:'ROOM_NOT_FOUND',message:'Room does not exist.'}}),1],
 ['409',async()=>json(409,{error:{code:'RECOMMENDATION_UNAVAILABLE',message:'No active player.'}}),1],
 ['500',async()=>json(500,{error:{code:'INTERNAL',message:'boom'}}),2],
 ['network',async()=>{throw new TypeError('failed');},2],
]){
 fresh();recommendationHandler=handler;
 push(running(1));await advance(120000);
 assert.equal(calls.recommendation,expected,name+' request count');
 assert.equal(store().recommendationStatus,'unavailable',name);
 assert.equal(store().roomMissing,false,name);assert.equal(store().bidErrorNotice,null,name);
 assert.equal(store().snapshot.roomCode,ROOM,name);assert.equal(store().roomCode,ROOM,name);assert.equal(store().snapshot.activePlayerId,'1',name);
}

// 5. Fetcher can be stopped; a late response after reset is ignored.
{
 let release;const f=new RecommendationFetcher(()=>new Promise(r=>{release=()=>r(rec);}));
 const seen=[];f.request(ROOM,'k',{result:()=>seen.push('result'),status:s=>seen.push(s)});await advance(10);
 f.reset();release();await advance(10);assert.deepEqual(seen,['loading']);
}

// 6. Authoritative lookup: REST /state 404 ROOM_NOT_FOUND sets roomMissing.
fresh();store().leaveAuction();
stateHandler=async()=>json(404,{error:{code:'ROOM_NOT_FOUND',message:'Room does not exist.'}});
store().initAuction(ROOM);await advance(10);
assert.equal(store().roomMissing,true);assert.equal(calls.state,1);assert.equal(store().bidErrorNotice,null);

// 7. REST /state 429 / 500 / network never mark the room missing; retries are capped; recovery clears the notice.
for(const [name,handler] of [
 ['429',async()=>json(429,{error:{code:'RATE_LIMITED',message:'Request rejected.'}},{'retry-after':'2'})],
 ['500',async()=>json(500,{error:{code:'INTERNAL',message:'boom'}})],
 ['network',async()=>{throw new TypeError('failed');}],
]){
 fresh();store().leaveAuction();stateHandler=handler;
 store().initAuction(ROOM);await flush();await advance(600000);
 assert.equal(store().roomMissing,false,name);assert.equal(store().bidErrorNotice,null,name);assert.ok(store().syncNotice,name);
 assert.equal(calls.state,6,name+' initial + 5 capped retries');
}
{
 fresh();store().leaveAuction();let failing=true;
 const good=running(5);
 stateHandler=async()=>failing?json(500,{error:{code:'INTERNAL',message:'boom'}}):json(200,good);
 store().initAuction(ROOM);await advance(10);assert.ok(store().syncNotice);
 failing=false;await advance(60000);
 assert.equal(store().syncNotice,null);assert.equal(store().roomMissing,false);assert.equal(store().snapshot?.roomCode,ROOM);
}

// 8. WebSocket ERROR: only ROOM_NOT_FOUND marks the room missing; a loaded snapshot is preserved.
fresh();push(running(1));
store().handleServerEvent({type:'ERROR',sequence:0,serverTime:now,payload:{reason:'RATE_LIMITED',message:'Slow down'}});
assert.equal(store().roomMissing,false);assert.ok(store().snapshot);
store().handleServerEvent({type:'ERROR',sequence:0,serverTime:now,payload:{reason:'ROOM_NOT_FOUND',message:'Room does not exist.'}});
assert.equal(store().roomMissing,true);assert.ok(store().snapshot,'snapshot is not cleared');
push(running(9));assert.equal(store().roomMissing,false,'a fresh authoritative snapshot clears it');

console.log('PASS: recommendation fetch bounded, 429 backoff capped, failures isolated from room state, authoritative 404 only.');
