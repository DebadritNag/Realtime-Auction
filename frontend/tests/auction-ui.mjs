/** Opt-in browser test: real sign-in, isolated in-memory Fastify auction; no production rooms modified. */
import {chromium,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildApp} from '../../backend/src/app.ts';
import {StaticTokenAuthService} from '../../backend/src/modules/auth-context/auth.service.ts';
import {CatalogPlayerRepository} from '../../backend/src/modules/players/player.service.ts';
import {RoomService} from '../../backend/src/modules/rooms/room.service.ts';
if(process.env.RUN_AUCTION_UI_TEST!=='1')throw new Error('Set RUN_AUCTION_UI_TEST=1 to run with one disposable Supabase login.');
const base=process.env.TEST_FRONTEND_URL||'http://localhost:3200';
const authUrl=process.env.SUPABASE_URL;
const adminHeaders={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
let userId,token,app,browser;
const output=fileURLToPath(new URL('../test-results/',import.meta.url));await mkdir(output,{recursive:true});
try {
 const password='Auction!'+randomUUID(),email='auction_ui_'+randomUUID().slice(0,8)+'@example.com';
 const created=await fetch(authUrl+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{username:'ui_'+randomUUID().slice(0,8),display_name:'Auction Test Manager'}})});
 const user=await created.json();if(!created.ok)throw new Error('Test account creation failed');userId=user.id;
 const login=await fetch(authUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const session=await login.json();if(!login.ok)throw new Error('Test sign-in failed');token=session.access_token;
 const catalog=await CatalogPlayerRepository.fromDefaultPool();const full=await catalog.listPlayerPool({});
 const featured=full.find(p=>p.name.includes('Mbapp'))??full[0];
 const pool=[{...featured,basePriceUnits:2},...full.filter(p=>p.id!==featured.id).slice(0,25)];
 const auth=new StaticTokenAuthService(new Map([[token,{userId,username:'Manager'}]]));
 const built=await buildApp({authService:auth,playerRepository:new CatalogPlayerRepository(pool),logger:false,timersEnabled:false,origins:[new URL(base).origin]});app=built.app;
 const {manager,engine}=built;
 const room=await manager.create({userId,username:'Manager'},{auctionName:'Champions Auction',teamName:'North London United',settings:{minSquadSize:1,numberOfTeams:4,startingBudgetCr:200,playerTimerSeconds:300,autoAdvance:false}});
 const roomService=new RoomService(manager);
 for(const [id,name] of [['rival','Royal Madrid'],['third','Manchester City'],['fourth','Bayern Munich']])await roomService.join(room.code,id,{teamName:name});
 await engine.execute(room.code,userId,{type:'START_AUCTION',payload:{roomCode:room.code}});
 await engine.execute(room.code,'rival',{type:'PLACE_BID',payload:{roomCode:room.code,amountCr:10}});
 const state=()=>manager.loadRoom(room.code);
 await app.ready();
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Use a genuine session cookie, with test Fastify authorization mapped to the same verified subject.
 const cookieName='sb-'+new URL(authUrl).hostname.split('.')[0]+'-auth-token';
 await context.addCookies([{name:cookieName,value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:base,sameSite:'Lax'}]);
 await context.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());const response=await app.inject({method:req.method(),url:url.pathname+url.search,headers:{...req.headers(),authorization:'Bearer '+token},...(req.postData()?{payload:req.postData()}:{})});await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.body});});
 await context.routeWebSocket(/\/ws(?:\?|$)/,async ws=>{
  console.log('Intercepted auction socket');
  let upstream;const queued=[];ws.onMessage(message=>{console.log('Command',JSON.parse(String(message)).type);if(upstream)upstream.send(message);else queued.push(message);});
  upstream=await app.injectWS('/ws?token='+encodeURIComponent(token),{headers:{origin:new URL(base).origin}});
  upstream.on('message',data=>{const e=JSON.parse(data.toString());console.log('Event',e.type,e.payload?.reason??'');ws.send(data.toString());});ws.onClose(()=>upstream.close());
  for(const message of queued)upstream.send(message);
 });
 await page.goto(base+'/auction/'+room.code);
 const quick=delta=>page.getByRole('button',{name:new RegExp('\\(\\+'+delta+' Cr\\)$')});
 await page.waitForTimeout(1500);console.log((await page.locator('.auction-workspace').innerText()).slice(0,700));
 await expect(quick(1)).toBeEnabled();await expect(page.getByRole('heading',{name:featured.name,exact:true})).toBeVisible();
 await page.screenshot({path:output+'auction-desktop.png',fullPage:true});
 const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 expect(await overflow()).toBe(false);
 await quick(1).click();await expect.poll(async()=>(await state()).active.currentBidUnits).toBe(22);
 await expect(quick(3)).toBeDisabled(); // highest bidder cannot raise themselves
 await engine.execute(room.code,'rival',{type:'PLACE_BID',payload:{roomCode:room.code,amountCr:13}});
 await expect(quick(3)).toBeEnabled();await quick(3).click();await expect.poll(async()=>(await state()).active.currentBidUnits).toBe(32);
 await engine.execute(room.code,'rival',{type:'PLACE_BID',payload:{roomCode:room.code,amountCr:19}});
 await expect(quick(5)).toBeEnabled();await quick(5).click();await expect.poll(async()=>(await state()).active.currentBidUnits).toBe(48);
 await engine.execute(room.code,'rival',{type:'PLACE_BID',payload:{roomCode:room.code,amountCr:26}});
 await expect(quick(1)).toBeEnabled();await quick(1).click();await expect(page.getByRole('alert')).toBeVisible();
 expect((await state()).active.currentBidUnits).toBe(52); // +1 cannot bypass the server's +2 minimum
 await page.getByRole('button',{name:'Dismiss bid error'}).click();
 await page.getByRole('button',{name:'Custom bid',exact:true}).click();await page.getByLabel('Bid Amount (in ₹ Cr)').fill('30');await page.getByRole('button',{name:'Confirm bid',exact:true}).click();await expect.poll(async()=>(await state()).active.currentBidUnits).toBe(60);
 await engine.execute(room.code,'rival',{type:'PLACE_BID',payload:{roomCode:room.code,amountCr:32}});
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(quick(3)).toBeDisabled();
 await page.getByRole('button',{name:'Resume Auction',exact:true}).click();await expect(quick(3)).toBeEnabled();
 await page.getByRole('button',{name:/^Bid ₹34/}).click();await expect.poll(async()=>(await state()).active.currentBidUnits).toBe(68);
 for(const [name,width,height] of [['tablet',900,1100],['mobile',390,844],['small-mobile',320,740]]){
  await page.setViewportSize({width,height});expect(await overflow()).toBe(false);
  await page.screenshot({path:output+'auction-'+name+'.png',fullPage:true});
 }
 await page.getByRole('button',{name:'Players',exact:true}).click();await page.getByLabel('Filter player pool').last().fill('Courtois');
 await expect(page.getByText('T. Courtois',{exact:true}).last()).toBeVisible();
 expect(errors).toEqual([]);
 console.log('PASS: +1/+3/+5, server rejection without state mutation, self-raise prevention, custom bid, pause/resume, server minimum bid, responsive overflow and mobile pool filtering.');
 console.log('Screenshots: frontend/test-results/auction-{desktop,tablet,mobile,small-mobile}.png');
} finally {
 await browser?.close();await app?.close();
 if(token)await fetch(authUrl+'/auth/v1/logout?scope=global',{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
 if(userId){const r=await fetch(authUrl+'/auth/v1/admin/users/'+userId,{method:'DELETE',headers:adminHeaders});if(!r.ok)throw new Error('Temporary account cleanup failed');console.log('Temporary UI test account removed.');}
}
