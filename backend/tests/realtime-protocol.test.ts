import {it,expect} from 'vitest';
import {realtimeManagerState} from '../src/modules/manager-mode/realtime-state.js';
import {MemoryManagerRepository} from '../src/modules/manager-mode/manager.repository.js';
import {ManagerModeService} from '../src/modules/manager-mode/manager.service.js';
import {source} from './seasons.test.js';

it('trims historical payloads while retaining current match scorers, history counts and private recipient filtering',async()=>{
 const room=source(),repo=new MemoryManagerRepository(),service=new ManagerModeService(repo,async()=>room);
 const created=await service.create(room.id,'user0',{name:'Realtime projection'});
 await repo.mutate(created.id,t=>{
  for(let season=0;season<20;season++)t.fixtures.push(...t.fixtures.slice(0,28).map(f=>({...f,id:f.id+'old'+season,seasonId:'old'+season})));
  for(let season=0;season<20;season++)t.seasonData!.seasons.push({...t.seasonData!.seasons[0]!,id:'old'+season,number:season+2});
  t.notifications=Array.from({length:300},(_,i)=>({id:'n'+i,userId:i%2?'user0':'user1',type:'TEST',title:'Test',message:'Notice',read:false,createdAt:i,metadata:{}}));
 });
 const full=await service.state(created.id,'user0'),compact=realtimeManagerState(full);
 expect(compact.seasonFixturesById).toEqual({});expect(compact.seasonFixtureCounts?.old0?.total).toBe(28);
 expect(compact.fixtures).toEqual(full.fixtures);expect(compact.notifications).toHaveLength(50);
 expect(compact.notifications.every(n=>n.userId==='user0')).toBe(true);
 expect(compact.transactions.every(t=>t.type!=='AUCTION_PURCHASE')).toBe(true);
 expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length*.8);
 expect(JSON.stringify(compact)).not.toContain('startingSnapshot');expect(JSON.stringify(compact)).not.toContain('minimumValueUnits');
 console.log('snapshot bytes',{before:Buffer.byteLength(JSON.stringify(full)),after:Buffer.byteLength(JSON.stringify(compact))});
});
