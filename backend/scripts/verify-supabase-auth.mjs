import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {decodeProtectedHeader} from 'jose';
import {buildApp} from '../src/app.ts';
import {JwtAuthService} from '../src/modules/auth-context/auth.service.ts';
import {CatalogPlayerRepository} from '../src/modules/players/player.service.ts';
if(process.env.RUN_LIVE_AUTH_TEST!=='1')throw new Error('Set RUN_LIVE_AUTH_TEST=1 to create and delete one temporary Supabase test account.');
const url=process.env.SUPABASE_URL.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
let userId;let app;let token;
try{
 const password='Test!'+randomUUID();const email='auth_check_'+randomUUID().slice(0,8)+'@example.com';
 const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{username:'check_'+randomUUID().slice(0,8)}})});
 const user=await created.json();assert.equal(created.status,200,'Temporary user creation failed');userId=user.id;
 const login=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const session=await login.json();assert.equal(login.status,200,'Supabase password sign-in failed');token=session.access_token;
 console.log({supabaseSignIn:login.status,algorithm:decodeProtectedHeader(token).alg});
 const result=await buildApp({origins:["http://localhost:3000",process.env.TEST_FRONTEND_URL||"http://localhost:3100"],logger:false,timersEnabled:false,authService:new JwtAuthService({secret:process.env.JWT_SECRET,jwksUrl:process.env.JWT_JWKS_URL||url+'/auth/v1/.well-known/jwks.json',issuer:process.env.JWT_ISSUER||url+'/auth/v1',audience:process.env.JWT_AUDIENCE||'authenticated'}),playerRepository:await CatalogPlayerRepository.fromDefaultPool()});app=result.app;
 for(const path of ['/api/profile','/api/profile/stats','/api/profile/achievements','/api/profile/history','/api/players']){
  const r=await app.inject({url:path,headers:{authorization:'Bearer '+token}});assert.equal(r.statusCode,200,path+' must authenticate');console.log({path,status:r.statusCode,...(path==='/api/players'?{players:r.json().catalogTotal}:{})});
 }
 await app.ready();const socket=await app.injectWS('/ws?token='+encodeURIComponent(token),{headers:{origin:'http://localhost:3000'}});socket.close();console.log({websocketAuthenticated:true});
 if(process.env.CHECK_DEPLOYED_API){const r=await fetch(process.env.CHECK_DEPLOYED_API.replace(/\/$/,'')+'/api/profile/stats',{headers:{Authorization:'Bearer '+token}});console.log({deployedProfileStatsStatus:r.status});}
 if(process.env.TEST_FRONTEND_URL){
  const {chromium,expect}=await import('../../frontend/node_modules/@playwright/test/index.mjs');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const context=await browser.newContext();const page=await context.newPage();const browserErrors=[];const apiResults=[];
   page.on('pageerror',e=>browserErrors.push(e.message));
   // Exercise the real frontend against the fixed local Fastify app, leaving deployed services unchanged.
   await page.route('**/api/**',async route=>{
    const req=route.request();const u=new URL(req.url());const body=req.postData();
    const response=await app.inject({method:req.method(),url:u.pathname+u.search,headers:req.headers(),...(body?{payload:body}:{})});
    apiResults.push({path:u.pathname,status:response.statusCode});
    await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.body});
   });
   await page.goto(process.env.TEST_FRONTEND_URL+'/auth/signin');
   await page.getByLabel('Email Address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
   await page.getByRole('button',{name:'SIGN IN TO ARENA',exact:true}).click();await page.waitForURL('**/home');
   await expect.poll(()=>apiResults.filter(r=>r.path.startsWith('/api/profile')&&r.status===200).length).toBeGreaterThanOrEqual(4);
   await page.waitForLoadState('networkidle');
   await page.reload();await expect(page).toHaveURL(/\/home$/);
   await page.goto(process.env.TEST_FRONTEND_URL+'/create');
   await page.getByText('Player catalog (760 players)',{exact:true}).click();
   await page.getByLabel('Search player catalog').fill('Courtois');
   await expect(page.getByRole('cell',{name:/T. Courtois/})).toBeVisible();
   assert.equal(apiResults.some(r=>r.status===401),false);assert.deepEqual(browserErrors,[]);
   console.log({browserSignIn:true,sessionRefresh:true,catalogPreview:true,profileRequestsWithout401:true});
  }finally{await browser.close();}
 }
 console.log('PASS: real Supabase session accepted by all local profile endpoints, catalog and WebSocket.');
}finally{
 await app?.close();
 if(token)await fetch(url+'/auth/v1/logout?scope=global',{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
 if(userId){const removed=await fetch(url+'/auth/v1/admin/users/'+userId,{method:'DELETE',headers});assert.ok(removed.ok,'Temporary test account cleanup failed');console.log('Temporary account removed.');}
}
