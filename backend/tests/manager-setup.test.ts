import {afterEach,it,expect,vi} from 'vitest';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeFile,mkdtemp,rm,rmdir} from 'node:fs/promises';
import {buildApp} from '../src/app.js';
import {StaticTokenAuthService} from '../src/modules/auth-context/auth.service.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {readCompletedAuction,loadManagerAuction,type Db} from '../src/modules/manager-mode/auction-snapshot.repository.js';
import {setupStep} from '../src/modules/manager-mode/setup-diagnostics.js';
const auction={id:'auction-id',code:'ABC234',name:'Early finish',host_user_id:'host',status:'COMPLETED',created_at:new Date().toISOString(),number_of_teams:2,starting_budget_units:400,minimum_squad_size:1,maximum_squad_size:24,minimum_base_price_units:2,player_timer_seconds:10};
const teams=[{id:'team1',user_id:'host',profile_id:'host',username:'Host',team_name:'Home',starting_budget_units:400,spent_units:4},{id:'team2',user_id:'guest',profile_id:'guest',username:'Guest',team_name:'Away',starting_budget_units:400,spent_units:0}];
function pool(){return ['SOLD','UNSOLD','WAITING','SKIPPED','RECALLED','SOLD'].map((status,i)=>({id:'pool'+i,player_id:'p'+i,status,winning_team_id:i===0?'team1':null,final_price_units:i===0?4:null,base_price_units:2,player:{id:'p'+i,name:'Player '+i,overall:82,position:'CM',passing:80}}));}
function fake(room:object|null=auction,members:object[]=teams,players:object[]=pool()):Db{return (async(parts:TemplateStringsArray)=>{const sql=parts.join('?');return sql.includes('from public.auction_rooms')?(room?[room]:[]):sql.includes('from public.room_members')?members:players;}) as unknown as Db;}
afterEach(()=>vi.unstubAllEnvs());
it('loads early completion by ownership, including unsold/unseen/recalled and null-owner SOLD',async()=>{
 const room=(await readCompletedAuction(fake(),'auction-id'))!;expect(room.players).toHaveLength(6);expect(room.purchases).toHaveLength(1);expect(room.players.filter(p=>p.status==='SOLD')).toHaveLength(1);
 const app=(await buildApp({authService:new StaticTokenAuthService(new Map([['token',{userId:'host'}]])),managerRepository:new MemoryManagerRepository(),managerAuctionSource:async()=>room,logger:false,timersEnabled:false})).app;
 try{const result=await app.inject({url:'/api/manager-mode/from-auction/auction-id',headers:{authorization:'Bearer token'}});expect(result.statusCode).toBe(200);expect(result.json().players).toHaveLength(6);expect(result.json().importReport.validPlayers).toBe(357);}finally{await app.close();}
});
it('returns explicit deployment configuration errors for missing or malformed default CSV',async()=>{
 const room=(await readCompletedAuction(fake(),'auction-id'))!,dir=await mkdtemp(join(tmpdir(),'manager-pool-'));
 const app=(await buildApp({authService:new StaticTokenAuthService(new Map([['token',{userId:'host'}]])),managerRepository:new MemoryManagerRepository(),managerAuctionSource:async()=>room,logger:false,timersEnabled:false})).app;
 try{vi.stubEnv('MANAGER_MODE_EXTERNAL_PLAYERS_PATH',join(dir,'missing.csv'));let result=await app.inject({url:'/api/manager-mode/from-auction/auction-id',headers:{authorization:'Bearer token'}});expect(result.statusCode).toBe(503);expect(result.json().error).toMatchObject({code:'EXTERNAL_PLAYER_POOL_UNAVAILABLE',step:'LOAD_EXTERNAL_PLAYERS',fileCode:'ENOENT'});
 await writeFile(join(dir,'invalid.csv'),'wrong,columns\nx,y');vi.stubEnv('MANAGER_MODE_EXTERNAL_PLAYERS_PATH',join(dir,'invalid.csv'));result=await app.inject({url:'/api/manager-mode/from-auction/auction-id',headers:{authorization:'Bearer token'}});expect(result.statusCode).toBe(503);expect(result.json().error.code).toBe('INVALID_EXTERNAL_PLAYER_POOL');
 }finally{await app.close();await rm(join(dir,'invalid.csv'),{force:true});await rmdir(dir);}
});
it('rejects missing winners, profiles, prices, and incomplete auction status descriptively',async()=>{
 const players=pool();players[0]!.winning_team_id='missing';await expect(readCompletedAuction(fake(auction,teams,players),'auction-id')).rejects.toMatchObject({code:'AUCTION_TEAM_MAPPING_MISSING',statusCode:409});
 players[0]!.winning_team_id='team1';players[0]!.final_price_units=null;await expect(readCompletedAuction(fake(auction,teams,players),'auction-id')).rejects.toMatchObject({code:'AUCTION_PURCHASE_INCOMPLETE'});
 await expect(readCompletedAuction(fake(auction,[{...teams[0],profile_id:null},teams[1]!]),'auction-id')).rejects.toMatchObject({code:'MANAGER_PROFILE_MISSING'});
 await expect(readCompletedAuction(fake({...auction,status:'RUNNING'}),'auction-id')).rejects.toMatchObject({code:'AUCTION_NOT_COMPLETED',statusCode:409});expect(await readCompletedAuction(fake(null),'auction-id')).toBeNull();
});
it('records step/constraint diagnostics without credentials and maps not-null errors',async()=>{
 const logs:object[]=[],logger={info:()=>{},error:(data:object)=>logs.push(data)};vi.stubEnv('GROQ_API_KEY','test-sensitive-key');const error=Object.assign(Error('test-sensitive-key Bearer secret-value'),{code:'23502',constraint_name:'manager_required'});
 await expect(setupStep(logger,'auction-id','LOAD_TEAMS',()=>{throw error;})).rejects.toMatchObject({code:'INCOMPLETE_MANAGER_DATA',statusCode:409,details:{step:'LOAD_TEAMS'}});expect(logs).toEqual([expect.objectContaining({auctionId:'auction-id',step:'LOAD_TEAMS',code:'23502',constraint:'manager_required'})]);expect(JSON.stringify(logs)).not.toContain('test-sensitive-key');expect(JSON.stringify(logs)).not.toContain('secret-value');
});

it('prefers authoritative local auction over an incomplete database mirror',async()=>{const room=(await readCompletedAuction(fake(),'auction-id'))!;const loaded=await loadManagerAuction(fake({...auction,status:'LOBBY'}),{listRecoverable:async()=>[room]},room.id);expect(loaded).toBe(room);});
