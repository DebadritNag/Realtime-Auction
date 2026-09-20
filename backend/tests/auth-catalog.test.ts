import { afterEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { JwtAuthService, StaticTokenAuthService } from '../src/modules/auth-context/auth.service.js';
import { CatalogPlayerRepository } from '../src/modules/players/player.service.js';
import { buildApp } from '../src/app.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
it('accepts ES256 signing keys alongside literal legacy HS256 secrets, rejecting forged/wrong-project tokens', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'current', alg: 'ES256', use: 'sig' };
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  const issuer = 'https://project.supabase.co/auth/v1';
  const secret = 'literal-base64-looking-secret-of-at-least-32-chars';
  const auth = new JwtAuthService({ secret, jwksUrl: `http://127.0.0.1:${address.port}/jwks`, issuer, audience: 'authenticated' });
  const sign = (iss: string) => new SignJWT({user_metadata:{username:'Manager'}}).setSubject('user-id').setAudience('authenticated').setIssuer(iss).setExpirationTime('1h').setProtectedHeader({alg:'ES256',kid:'current'}).sign(privateKey);
  expect(await auth.verifyAccessToken(await sign(issuer))).toMatchObject({userId:'user-id',username:'Manager'});
  await expect(auth.verifyAccessToken(await sign('https://another-project.supabase.co/auth/v1'))).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(auth.verifyAccessToken('forged')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  const legacy = await new SignJWT({}).setSubject('legacy-user').setAudience('authenticated').setIssuer(issuer).setExpirationTime('1h').setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(secret));
  expect(await auth.verifyAccessToken(legacy)).toMatchObject({userId:'legacy-user'});
  const {app}=await buildApp({authService:auth,logger:false,timersEnabled:false});cleanups.push(()=>app.close());
  const token=await sign(issuer);
  for(const path of ['/api/profile','/api/profile/stats','/api/profile/achievements','/api/profile/history']){
    expect((await app.inject({url:path,headers:{authorization:'Bearer '+token}})).statusCode).toBe(200);
    expect((await app.inject({url:path})).statusCode).toBe(401);
  }
});
it('serves the bundled CSV catalog behind authentication and starts auction with catalog players', async () => {
  const catalog=await CatalogPlayerRepository.fromDefaultPool(); const players=await catalog.listPlayerPool({});
  expect(players.length).toBeGreaterThan(200);expect(players.every(p=>!p.id.startsWith('demo-'))).toBe(true);
  const {app,engine,manager}=await buildApp({authService:new StaticTokenAuthService(new Map([['host-token',{userId:'host'}]])),playerRepository:catalog,logger:false,timersEnabled:false});
  cleanups.push(()=>app.close());const headers={authorization:'Bearer host-token'};
  expect((await app.inject({url:'/api/players'})).statusCode).toBe(401);
  const full=await app.inject({url:'/api/players',headers});expect(full.statusCode).toBe(200);expect(full.json().catalogTotal).toBe(players.length);
  const filtered=await app.inject({url:'/api/players?potId=GK&limit=2',headers});expect(filtered.json().players).toHaveLength(2);expect(filtered.json().players.every((p:{potId:string})=>p.potId==='GK')).toBe(true);
  expect((await app.inject({url:'/api/players?limit=0',headers})).statusCode).toBe(400);
  const created=await app.inject({method:'POST',url:'/api/rooms',headers,payload:{auctionName:'Catalog Test',teamName:'Host FC',settings:{minimumParticipants:1,minSquadSize:1}}});
  const code=created.json().roomCode;
  await engine.execute(code,'host',{type:'START_AUCTION',payload:{roomCode:code}});
  const state=await manager.loadRoom(code);expect(state.active?.playerId).toBe(players[0]?.id);
});
