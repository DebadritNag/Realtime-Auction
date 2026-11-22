import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const stub=(name,src)=>({name,setup(b){b.onResolve({filter:new RegExp(name+'$')},()=>({path:name,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>a.path===name?{contents:src,loader:'js'}:undefined);}});
const output=await build({stdin:{contents:`export {useAuctionStore} from './src/stores/auction.store';export {parseServerEvent} from './src/types/backend';export {mapPlayer} from './src/services/contract';`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':root+'src'},define:{'process.env.NEXT_PUBLIC_WS_URL':'"ws://test/ws"'},
 plugins:[stub('websocket.service','export const webSocketService={subscribe:()=>()=>{},connect(){},disconnect(){},send:async()=>{},reconnect(){}};export const backoffDelay=()=>1;'),
  stub('auth.service','export const authService={getAccessToken:async()=>"t"};')]});
globalThis.localStorage=globalThis.localStorage??{getItem:()=>null,setItem(){},removeItem(){}};
const module={exports:{}};new Function('module','exports','require',output.outputFiles[0].text)(module,module.exports,createRequire());
function createRequire(){return n=>{throw new Error('unexpected require '+n);};}
const {useAuctionStore,parseServerEvent,mapPlayer}=module.exports;

const dto=(id,o={})=>({id,name:id,position:'ATT',ovr:80,stats:{},basePriceCr:3,potId:'ATT',status:'WAITING',round:0,...o});
const team={id:'t1',userId:'u1',name:'T1',startingBudgetCr:100,spentCr:0,remainingBudgetCr:100,playerIds:[],playersOwned:0,maximumPermittedBidCr:100,minimumSquadMet:false};
const room=(sequence,players)=>({room:{id:'r',code:'ABC234',auctionName:'A',createdAt:1},roomId:'r',roomCode:'ABC234',settings:{},status:'RUNNING',activationId:'act1',
 skipVote:{votes:0,required:1,hasCurrentUserVoted:false},host:{userId:'u1'},currentPlayer:null,activePotId:'ATT',activePlayerId:'live',currentBidCr:12,highestBidderTeamId:'t1',
 minimumNextBidCr:13,maximumPermittedBidCr:100,startedAt:1,endsAt:99999,remainingTimeMs:5000,biddingOpen:true,lastBidAt:1,bidCount:2,nextPlayerAt:null,serverTime:1000,sequence,
 teams:[team],currentUserTeam:team,connectedUsers:[],players,playerQueue:[],playerQueueSummary:{remaining:players.length},soldPlayers:[],unsoldPlayers:[]});
const stateEvent=(sequence,players)=>({type:'ROOM_STATE',payload:room(sequence,players),roomId:'r',sequence,serverTime:1000});
const poolEvent=(sequence,batchId,ids)=>({type:'PLAYER_POOL_UPDATED',roomId:'r',sequence,serverTime:2000,payload:{auctionId:'r',roomCode:'ABC234',batchId,addedCount:ids.length,addedPlayerIds:ids,
 addedPlayers:ids.map(playerId=>({playerId,category:'ATT',releaseState:'FOLLOW'})),categoryCounts:{ATT:ids.length},heldCount:0,importedAt:2000}});

// Wire contract: both names are whitelisted.
const frame=(type,payload)=>JSON.stringify({type,payload,sequence:2,serverTime:1});
assert.equal(parseServerEvent(frame('PLAYER_POOL_UPDATED',{batchId:'b'})).type,'PLAYER_POOL_UPDATED');
assert.equal(parseServerEvent(frame('POOL_ADDITIONS_RELEASED',{playerIds:[],count:0})).type,'POOL_ADDITIONS_RELEASED');

// mapPlayer: NEW only while waiting.
const meta={poolStatus:'PENDING',importBatchId:'b1',importedAt:1,importedBy:'u1',sourceFile:'f.csv',sourceCategory:'ATT',release:'HELD'};
const snap=room(1,[]);
assert.equal(mapPlayer(dto('n',{poolMeta:meta}),snap).isNew,true);
assert.equal(mapPlayer(dto('n',{poolMeta:meta}),snap).releaseState,'HELD');
assert.equal(mapPlayer(dto('n',{poolMeta:meta,status:'SOLD'}),snap).isNew,false);
assert.equal(mapPlayer(dto('n'),snap).isNew,undefined);

const store=useAuctionStore;
store.setState({roomCode:'ABC234'});
store.getState().handleServerEvent(stateEvent(10,[dto('live',{status:'ACTIVE'}),dto('old')]));
const before=(()=>{const s=store.getState();return {id:s.activePlayer?.id,bid:s.currentBid,bidder:s.highestBidder?.id,endsAt:s.endsAt,remaining:s.remainingTimeMs};})();
assert.equal(before.id,'live');assert.equal(store.getState().poolNotice,null);

// Event first: notice appears, live lot untouched; then the snapshot brings the new players.
store.getState().handleServerEvent(poolEvent(11,'b1',['n1','n2']));
assert.deepEqual({...store.getState().poolNotice},{batchId:'b1',count:2,playerIds:['n1','n2'],at:2000});
store.getState().handleServerEvent(stateEvent(11,[dto('live',{status:'ACTIVE'}),dto('old'),dto('n1',{poolMeta:{...meta,release:'FOLLOW'}}),dto('n2',{poolMeta:{...meta,release:'FOLLOW'}})]));
const s=store.getState();
assert.deepEqual({id:s.activePlayer?.id,bid:s.currentBid,bidder:s.highestBidder?.id,endsAt:s.endsAt,remaining:s.remainingTimeMs},before);
assert.deepEqual(s.players.filter(p=>p.isNew).map(p=>p.id),['n1','n2']);
assert.deepEqual(s.players.map(p=>p.id).slice(0,2),['live','old']);

// Dismiss, replay and reconnect snapshots never re-notify.
store.getState().dismissPoolNotice();assert.equal(store.getState().poolNotice,null);
store.getState().handleServerEvent(poolEvent(11,'b1',['n1','n2']));
store.getState().handleServerEvent(stateEvent(11,s.snapshot.players));
store.getState().handleServerEvent(stateEvent(12,s.snapshot.players));
assert.equal(store.getState().poolNotice,null);

// A new batch notifies again; a zero-add event does not.
store.getState().handleServerEvent(poolEvent(13,'b2',['n3']));
assert.equal(store.getState().poolNotice.batchId,'b2');
store.getState().dismissPoolNotice();
store.getState().handleServerEvent(poolEvent(14,'b3',[]));
assert.equal(store.getState().poolNotice,null);
console.log('PASS: pool event names, mapPlayer NEW flag, notice only from the server event, once per batch, none on reconnect snapshots, live lot/bid/bidder/timer unchanged.');
