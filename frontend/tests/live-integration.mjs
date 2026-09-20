import { chromium, expect } from '@playwright/test';
import postgres from '../../backend/node_modules/postgres/src/index.js';
import { randomUUID } from 'node:crypto';
// Opt-in live integration. Creates four disposable users and one room, then deletes only those fixtures.
if (process.env.RUN_LIVE_INTEGRATION !== '1') throw new Error('Set RUN_LIVE_INTEGRATION=1 explicitly.');
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:3000';
const api = process.env.TEST_API_URL || 'http://localhost:4000';
const supabase = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sql = postgres(process.env.DATABASE_URL,{max:1,prepare:false,ssl:'require'});
const users=[]; let browser; let roomId; let roomCode;
const errors=[];
async function admin(path,method='GET',body){
 const r=await fetch(supabase+'/auth/v1/admin'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error('Fixture auth failed: '+r.status+' '+(data.msg||data.message||''));return data;
}
async function request(index,path,method='GET',body){
 const r=await fetch(api+'/api'+path,{method,headers:{Authorization:'Bearer '+users[index].token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error('API '+path+': '+JSON.stringify(data));return data;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(100);}throw new Error('Condition timed out');}
try {
 const tag=randomUUID().slice(0,8),password='Auction!'+randomUUID();
 for(let i=0;i<4;i++){
  const email=`integration_${tag}_${i}@example.com`;
  const created=await admin('/users','POST',{email,password,email_confirm:true,user_metadata:{username:`test_${tag}_${i}`,display_name:`Test Manager ${i+1}`}});
  users.push({id:created.id,email,password});
 }
 console.log('Created four temporary verified test users (no email sent).');
 browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'chrome',headless:true});
 for (const user of users){
  user.context=await browser.newContext({viewport:{width:1440,height:1000}});user.page=await user.context.newPage();user.events=[];
  user.page.on('pageerror',e=>errors.push(e.message));
  user.page.on('websocket',ws=>{user.ws=ws;ws.on('framereceived',({payload})=>{try{const event=JSON.parse(String(payload));user.events.push(event);if(event.type==='ROOM_STATE')user.state=event.payload;}catch{}});});
  await user.page.goto(base+'/auth/signin');
  await user.page.getByLabel('Email Address').fill(user.email);
  await user.page.getByLabel('Password',{exact:true}).fill(user.password);
  await user.page.getByRole('button',{name:'SIGN IN TO ARENA',exact:true}).click();
  await user.page.waitForURL('**/home');
  user.token=await user.page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));return JSON.parse(localStorage.getItem(key)).access_token;});
  await expect(user.page.getByText('Test Manager '+(users.indexOf(user)+1),{exact:true}).first()).toBeVisible();
 }
 console.log('Four real Supabase sign-ins and authenticated home pages passed.');
 const host=users[0].page;
 await host.goto(base+'/create');
 await host.locator('#auction-room-name').fill('Integration '+tag);
 await host.locator('#number-of-teams').fill('4');
 await host.locator('#min-squad-size').fill('1');
 await host.locator('#player-timer').fill('30');
 const createResponse=host.waitForResponse(r=>r.url()===api+'/api/rooms'&&r.request().method()==='POST');
 await host.getByRole('button',{name:'CREATE ROOM & ENTER LOBBY'}).click();
 const response=await createResponse;const created=await response.json();
 if(!response.ok())throw new Error('Create failed: '+JSON.stringify(created));
 roomId=created.roomId;roomCode=created.roomCode;
 await host.waitForURL('**/room/'+roomCode);await until(()=>users[0].state?.roomCode===roomCode);
 for(let i=1;i<4;i++){
  const page=users[i].page;await page.goto(base+'/join?code='+roomCode);
  await page.getByLabel('Team Franchise Name').fill('Integration Team '+i);
  await page.locator('button[type="submit"]').click();await page.waitForURL('**/room/'+roomCode);
 }
 await until(()=>users.every(u=>u.state?.teams.length===4));
 console.log('Room creation, three UI joins and all four lobby snapshots passed.');
 // Keep this run bounded, while the actual player catalog and all auction writes use PostgreSQL.
 const catalog=await sql`select id from football_players where active=true order by base_price_units,id limit 2`;
 await request(0,'/rooms/'+roomCode+'/settings','PATCH',{minSquadSize:1,minimumBasePriceCr:1,playerTimerSeconds:30,antiSnipingThresholdSeconds:5,antiSnipingResetSeconds:8,playerPoolConfig:{playerIds:catalog.map(p=>p.id)}});
 await host.getByRole('button',{name:/START AUCTION/}).click();
 await Promise.all(users.map(u=>u.page.waitForURL('**/auction/'+roomCode)));
 await until(()=>users.every(u=>u.state?.status==='RUNNING'&&u.state?.activePlayerId));
 const playerId=users[0].state.activePlayerId;
 expect(new Set(users.map(u=>u.state.activePlayerId)).size).toBe(1);
 const minimum=users[0].state.minimumNextBidCr;
 await users[1].page.getByRole('button',{name:/^BID ₹/}).click();
 await until(()=>users.every(u=>u.state.highestBidderTeamId===users[1].state.currentUserTeam.id));
 expect(users[0].state.currentBidCr).toBe(minimum);
 // Custom bids exercise every increment boundary through real browser controls.
 let bidder=2;
 for(const [amount,next] of [[9,9.5],[9.5,10],[10,11],[19,20],[20,22],[38,40]]){
  const p=users[bidder].page;await p.getByRole('button',{name:'Custom Bid',exact:true}).click();
  await p.getByLabel('Bid Amount (in ₹ Cr)').fill(String(amount));
  await p.getByRole('button',{name:/CONFIRM BID/i}).click();
  await until(()=>users.every(u=>u.state.currentBidCr===amount));
  expect(users[0].state.minimumNextBidCr).toBe(next);
  await expect(users[0].page.getByRole('button',{name:/^BID ₹/})).toContainText(String(next));
  bidder=bidder===2?1:2;
 }
 console.log('Opening bid and all six price-boundary button checks passed.');
 await host.getByRole('button',{name:'Pause',exact:true}).click();
 await until(()=>users.every(u=>u.state.status==='PAUSED'));
 await host.getByRole('button',{name:'Resume Auction',exact:true}).click();
 await until(()=>users.every(u=>u.state.status==='RUNNING'));
 await users[3].page.reload();await until(()=>users[3].state?.activePlayerId===playerId && users[3].events.filter(e=>e.type==='ROOM_STATE').length>3);
 await expect(users[3].page.getByRole('button',{name:/^BID ₹/})).toBeEnabled();
 // Two simultaneous browser bids: one wins at this ask; the other must be rejected.
 const before=users[0].state.sequence;
 await Promise.all([users[0].page.getByRole('button',{name:/^BID ₹/}).click(),users[3].page.getByRole('button',{name:/^BID ₹/}).click()]);
 await until(()=>users.every(u=>u.state.sequence>before));
 await until(()=>users.some(u=>u.events.some(e=>e.type==='BID_REJECTED')));
 expect(new Set(users.map(u=>u.state.currentBidCr)).size).toBe(1);
 expect(new Set(users.map(u=>u.state.highestBidderTeamId)).size).toBe(1);
 const oldEnd=users[0].state.endsAt;
 await pause(Math.max(0,oldEnd-Date.now()-3500));
 const winner=users.find(u=>u.state.currentUserTeam.id!==u.state.highestBidderTeamId);
 await winner.page.getByRole('button',{name:/^BID ₹/}).click();
 await until(()=>users.every(u=>u.state.endsAt>oldEnd));
 const salePrice=users[0].state.currentBidCr;
 await until(()=>users.every(u=>u.events.some(e=>e.type==='PLAYER_SOLD')),15000);
 await until(()=>users.every(u=>u.state.activePlayerId&&u.state.activePlayerId!==playerId),10000);
 const team=users[0].state.teams.find(t=>t.id===winner.state.currentUserTeam.id);
 expect(team.spentCr).toBe(salePrice);expect(team.playersOwned).toBe(1);expect(team.remainingBudgetCr).toBe(team.startingBudgetCr-salePrice);
 await users[3].context.setOffline(true);await pause(500);await users[3].context.setOffline(false);
 await users[3].page.reload();await expect(users[3].page.getByRole('button',{name:/^BID ₹/})).toBeEnabled();
 console.log('Pause/resume, refresh, concurrent rejection, anti-sniping, sale, budget and next-player checks passed.');
 await host.getByRole('button',{name:'End Auction',exact:true}).click();await host.getByRole('button',{name:'End Auction Now',exact:true}).click();
 await Promise.all(users.map(u=>u.page.waitForURL('**/results/'+roomCode)));
 const results=await request(0,'/rooms/'+roomCode+'/results');expect(results.playersSold).toBe(1);expect(results.totalSpendCr).toBe(salePrice);expect(results.provisional).toBe(false);
 const rows=await sql`select price_units from player_purchases where room_id=${roomId}`;expect(rows).toHaveLength(1);expect(Number(rows[0].price_units)).toBe(salePrice*2);
 expect(errors).toEqual([]);
 console.log('PASS: Four-browser live integration, authoritative results and persisted sale verified.');
} catch(e){console.error(e.message); if(browser){for(let i=0;i<users.length;i++)if(users[i].page)console.error('Browser '+i+': '+(await users[i].page.locator('body').innerText()).slice(0,1800));}process.exitCode=1;}
finally {
 await browser?.close();
 if(users.length){await sql`delete from auction_rooms where host_user_id in ${sql(users.map(u=>u.id))}`;for(const user of users)await admin('/users/'+user.id,'DELETE');}
 await sql.end();console.log('Temporary test rooms and users removed.');
}
