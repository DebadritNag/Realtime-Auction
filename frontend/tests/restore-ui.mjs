/** Offline browser test for RESTORE AUCTION FROM SNAPSHOT (create toggle + workflow, join picker, lobby panel, squad views). No network, accounts or production data. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const PURSES = [59, 50.5, 0, 29, 13.5, 48, 38, 20];
const SQUADS = [10, 9, 17, 10, 14, 11, 12, 16];
const RETAINED = [0, 1, 0, 3, 2, 1, 3, 1];
const SLOTS = [10, 11, 3, 10, 6, 9, 8, 4];
const NAMES = ['Ritzz FC', 'FidoDido FC', 'DDD', 'SIDERALE', 'APOLLO FC', 'RedBull FC', 'Dakshineswar FC', 'BGT'];

/** The default v3 preset served by the create page (8 teams, 75 players). */
const V3_NAMES = ['Ritzz FC', 'SIDERALE', 'BGT', 'DDD', 'RedBull FC', 'Dakshineswar FC', 'Fidodido FC', 'APOLLO FC'];
const V3_PURSES = [79.5, 44, 62, 63, 67, 42.5, 53, 13.5];
const V3_SQUADS = [6, 10, 6, 10, 6, 15, 8, 14];
const V3_SLOTS = [14, 10, 14, 10, 14, 5, 12, 6];
const V3_RETAINED = [1, 2, 2, 0, 0, 1, 2, 2];
const cr = (n) => '₹' + n + ' Cr';
/** Shared stub code: a template of 8 teams where one Ritzz FC player cannot be matched until the host resolves it. */
const fixtures = `
const NAMES=${JSON.stringify(V3_NAMES)},PURSES=${JSON.stringify(V3_PURSES)},SQUADS=${JSON.stringify(V3_SQUADS)},RETAINED=${JSON.stringify(V3_RETAINED)};
const template={version:1,name:'Super League Football Auction 2026 (Restored v3)',hostTeam:'Ritzz FC',teams:NAMES.map((name,t)=>({name,squadSize:SQUADS[t],remainingPurseCr:PURSES[t],retainedCount:RETAINED[t],
 players:Array.from({length:SQUADS[t]},(_,i)=>({name:(t===0&&i===0?'Mystery Striker':name.split(' ')[0]+' Player '+(i+1)),position:i%4===0?'GK':'CM',acquisition:i<RETAINED[t]?'RETENTION':'AUCTION',underdog:i===SQUADS[t]-1}))}))};
function buildPreview(snap){
 const issues=[];
 const teams=snap.teams.map(t=>{
  const players=t.players.map(p=>{
   const resolved=p.playerId||p.manual;
   const unmatched=!resolved&&p.name==='Mystery Striker';
   if(unmatched)issues.push({severity:'CRITICAL',code:'PLAYER_UNMATCHED',teamName:t.name,playerName:p.name,message:'Could not match '+p.name+' in '+t.name+'. Pick the right player or create a manual one.'});
   return {name:p.name,position:p.position,acquisition:p.acquisition,underdog:!!p.underdog,verify:false,issues:[],priceCr:p.acquisition==='RETENTION'?15:3,
    match:{kind:unmatched?'UNMATCHED':p.playerId?'RESOLVED':p.manual?'MANUAL':'MATCHED_FC26',suggestions:[]}};
  });
  return {name:t.name,squadSize:t.squadSize,actualPlayers:players.length,remainingSlots:20-t.squadSize,remainingPurseCr:t.remainingPurseCr,retainedCount:t.retainedCount,auctionCount:t.squadSize-t.retainedCount,players};
 });
 return {name:snap.name,teams,issues,totals:{teams:8,players:75,retained:10,auction:65,matchedFc26:74,matchedDefaultPool:0,manual:0,unresolved:issues.length},
  remainingPool:{total:4321,byPot:{GK:300,CB:900,FB:700,MID:1500,ATT:921}},canConfirm:issues.length===0};
}
window.calls=[];
`;

const createBundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import CreateRoomPage from './src/app/create/page';
import {restoreService} from './src/services/restore.service';
import {useRoomStore} from './src/stores/room.store';
${fixtures}
restoreService.templates=async()=>{window.calls.push('templates');return [{id:'v3',name:template.name,teamCount:8,playerCount:75,hostTeam:'Ritzz FC',isDefault:true,snapshot:template},{id:'old',name:'Super League Football Auction 2026',teamCount:8,playerCount:99,hostTeam:'Ritzz FC',isDefault:false,snapshot:{...template,name:'Super League Football Auction 2026'}}];};
restoreService.preview=async snap=>{window.calls.push('preview');return buildPreview(snap);};
restoreService.searchPlayers=async q=>{window.calls.push('search '+q.search);return {total:1,offset:0,limit:8,players:[{id:'fc26-77',name:'M. Striker',fullName:'Mystery Striker',position:'FWD',subPosition:'ST',ovr:80,club:'Test FC',positions:['ST'],stats:{},basePriceCr:5,potId:'ATT',status:'WAITING',round:0}]};};
const USERS=[{userId:'u-deb',username:'debadrit',displayName:'Debadrit Nag'},{userId:'u-sam',username:'sam99',displayName:'Sam Roy'}];
restoreService.searchUsers=async q=>{window.calls.push('users '+q);return USERS.filter(u=>(u.username+u.displayName).toLowerCase().includes(q.toLowerCase()));};
restoreService.create=async input=>{window.calls.push('create');window.created=input;return {roomId:'r',roomCode:'ABC234',restore:{source:'TEMPLATE',snapshotName:'x',warnings:[],teams:[]},remainingPool:{total:1,byPot:{}}};};
useRoomStore.setState({createRoom:async()=>{window.calls.push('normal createRoom');return 'ZZZ999';}});
createRoot(document.getElementById('root')).render(<CreateRoomPage/>);
`);

const joinBundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import JoinPage from './src/app/join/page';
import {restoreService} from './src/services/restore.service';
import {useRoomStore} from './src/stores/room.store';
window.calls=[];
const teams=[{id:'t1',name:'Ritzz FC',claimed:false},{id:'t2',name:'FidoDido FC',claimed:true},{id:'t3',name:'DDD',claimed:false}];
const PICK=[{id:'t1',name:'Ritzz FC',claimed:false,reserved:true},{id:'t2',name:'FidoDido FC',claimed:true,reserved:false},{id:'t3',name:'DDD',claimed:false,reserved:false}];
const MINE=[{id:'t1',name:'Ritzz FC',claimed:false,reserved:true,reservedForYou:true},{id:'t2',name:'FidoDido FC',claimed:true,reserved:false},{id:'t3',name:'DDD',claimed:false,reserved:true}];
restoreService.lookup=async code=>{window.calls.push('lookup '+code);if(code==='PQR234')return {roomCode:code,auctionName:'r',status:'LOBBY',restore:{snapshotName:'S',teams:PICK}};if(code==='RES234')return {roomCode:code,auctionName:'r',status:'LOBBY',restore:{snapshotName:'S',teams:MINE}};return code==='NORMAL'?{roomCode:code,auctionName:'n',status:'LOBBY'}:{roomCode:code,auctionName:'r',status:'LOBBY',restore:{snapshotName:'Super League Football Auction 2026',teams}};};
useRoomStore.setState({joinRoom:async input=>{window.calls.push('join '+JSON.stringify(input));return true;}});
createRoot(document.getElementById('root')).render(<JoinPage/>);
`);

const viewsBundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RestoreLobbyPanel} from './src/components/restore/RestoreLobbyPanel';
import {RestorePoolPanel} from './src/components/restore/RestorePoolPanel';
import {SquadOverview} from './src/components/auction/SquadOverview';
import {mapTeams} from './src/services/contract';
import {restoreService} from './src/services/restore.service';
const NAMES=${JSON.stringify(NAMES)},PURSES=${JSON.stringify(PURSES)},SQUADS=${JSON.stringify(SQUADS)},RETAINED=${JSON.stringify(RETAINED)};
window.calls=[];
const restore={enabled:true,source:'TEMPLATE',snapshotName:'Super League Football Auction 2026',restoredAt:0,warnings:[],unclaimedCount:2,
 teams:NAMES.map((name,t)=>({teamId:'t'+t,name:t===1?'Fido Slayers':name,originalName:name,reserved:t===6,reservedLabel:t===6?'Sam Roy':undefined,claimed:t<6,purseCr:PURSES[t],openingPurseCr:PURSES[t],squadSize:SQUADS[t],remainingSlots:20-SQUADS[t],retainedCount:RETAINED[t],auctionCount:SQUADS[t]-RETAINED[t]}))};
restoreService.release=async(code,id)=>{window.calls.push('release '+code+' '+id);return {teams:[],sequence:1};};
restoreService.searchUsers=async q=>{window.calls.push('users '+q);return [{userId:'u-deb',username:'debadrit',displayName:'Debadrit Nag'}];};
const bindTeam=async(id,uid)=>{window.calls.push('bind '+id+' '+uid);};
restoreService.pool=async(code,q)=>{window.calls.push('pool '+(q.search||'')+' '+(q.offset||0));
 const all=Array.from({length:45},(_,i)=>({id:'p'+i,name:'Pool Player '+i,position:'MID',subPosition:'CM',ovr:70,stats:{},basePriceCr:1,potId:'MID',status:'WAITING',round:0,...(i===0?{playerTag:'UNDERDOG'}:{})}));
 const rows=q.search?all.filter(p=>p.name.includes(q.search)):all;
 return {total:rows.length,offset:q.offset||0,limit:q.limit||50,poolTotal:4321,byPot:{GK:300,CB:900,FB:700,MID:1500,ATT:921},ownedCount:99,players:rows.slice(q.offset||0,(q.offset||0)+(q.limit||50)),sequence:1};};
const pl=(id,name,extra)=>({id,name,ovr:80,position:'MID',potId:'MID',stats:{},basePriceCr:5,status:'SOLD',round:0,...extra});
const dto={connectedUsers:[],currentUserTeam:{id:'a'},
 teams:[{id:'a',userId:'u1',name:'Ritzz FC',startingBudgetCr:59,spentCr:0,remainingBudgetCr:59,playerIds:['r1','a1'],playersOwned:2,claimed:true,remainingSlots:18},
        {id:'b',userId:'unclaimed:b',name:'DDD',startingBudgetCr:0,spentCr:0,remainingBudgetCr:0,playerIds:[],playersOwned:0,claimed:false,remainingSlots:20}],
 players:[pl('r1','Ret Player',{playerTag:'UNDERDOG'}),pl('a1','Auction Player')],
 soldPlayers:[{id:'s1',playerId:'r1',teamId:'a',priceCr:null,bidCount:0,at:0,durationMs:0,acquisitionType:'RETENTION',isRetained:true,restoredFromSnapshot:true,recordedPriceCr:15},
              {id:'s2',playerId:'a1',teamId:'a',priceCr:null,bidCount:0,at:0,durationMs:0,acquisitionType:'AUCTION',isRetained:false,restoredFromSnapshot:true,recordedPriceCr:4.5}]};
const teams=mapTeams(dto);
window.mapped=teams.map(t=>({name:t.name,claimed:t.claimed,connected:t.connected,manager:t.managerUsername,remaining:t.remainingSlots,prices:t.squad.map(p=>String(p.soldPrice)),restored:t.squad.map(p=>p.restoredFromSnapshot===true),retained:t.squad.map(p=>p.isRetained)}));
const isHost=location.hash!=='#guest';
createRoot(document.getElementById('root')).render(<div style={{padding:12,display:'grid',gap:16}}>
 <RestoreLobbyPanel restore={restore} isHost={isHost} currentTeamId="t0" onRelease={async id=>{await restoreService.release('ABC234',id);}} onBind={bindTeam}/>
 <RestorePoolPanel roomCode="ABC234"/>
 <SquadOverview teams={teams} currentTeamId="a" maxSquadSize={20} mode="all"/>
</div>);
`);

// ---- Create page: toggle OFF/ON, template, preview, resolution, confirm ----
for (const width of [375, 768, 1280]) {
  const { browser, page, errors } = await openPage(createBundle, { viewport: { width, height: 900 } });
  try {
    const toggle = page.getByTestId('restore-toggle');
    await expect(page.getByRole('heading', { name: 'Restore Previous Auction State' })).toBeVisible();
    await expect(page.getByText('Restore existing teams, players, squad progress and remaining purses from a previous auction so you can auction the remaining players.')).toBeVisible();
    // OFF: normal form unchanged (teams, budget, database source, retention and the normal submit)
    await expect(toggle).not.toBeChecked();
    await expect(page.getByLabel('NUMBER OF TEAMS (2 – 16)')).toBeVisible();
    await expect(page.getByText('PLAYER DATABASE SOURCE')).toBeVisible();
    await expect(page.getByText('PLAYER RETENTION')).toBeVisible();
    await expect(page.getByRole('button', { name: /CREATE ROOM/ })).toBeVisible();
    await expect(page.getByTestId('restore-workflow')).toHaveCount(0);

    // ON: workflow replaces the normal submit
    await toggle.check({ force: true });
    await expect(page.getByTestId('restore-workflow')).toBeVisible();
    await expect(page.getByRole('button', { name: /CREATE ROOM/ })).toHaveCount(0);
    await expect(page.getByText('PLAYER DATABASE SOURCE')).toHaveCount(0);

    // the default preset loads automatically (no click): 8 teams with exact purses, squads and slots
    await expect(page.getByTestId('restore-team-row')).toHaveCount(8);
    const col = async (id) => (await page.getByTestId(id).allTextContents()).map((s) => s.trim());
    expect(await page.getByTestId('restore-team-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-team')))).toEqual(V3_NAMES);
    expect(await col('restore-purse')).toEqual(V3_PURSES.map(cr));
    expect(await col('restore-squad')).toEqual(V3_SQUADS.map((n) => n + '/20'));
    expect(await col('restore-slots')).toEqual(V3_SLOTS.map(String));
    expect(await col('restore-retained')).toEqual(V3_RETAINED.map(String));
    const auction = V3_SQUADS.map((n, i) => String(n - V3_RETAINED[i]));
    expect(await col('restore-auction')).toEqual(auction);
    await expect(page.getByTestId('restore-totals')).toContainText('8 teams, 75 players (10 retained, 65 auction acquired)');
    // the default preset is selected and the old template is selectable
    await expect(page.getByTestId('restore-template-select')).toHaveValue('v3');
    expect(await page.getByTestId('restore-template-select').locator('option').allTextContents()).toEqual(['Super League Football Auction 2026 (Restored v3) (default)', 'Super League Football Auction 2026']);
    // toggling OFF and ON again replaces the preset: still 8 teams, never 16
    await toggle.uncheck({ force: true });
    await expect(page.getByTestId('restore-workflow')).toHaveCount(0);
    await toggle.check({ force: true });
    await expect(page.getByTestId('restore-team-row')).toHaveCount(8);
    await page.getByTestId('restore-load-template').click();
    await expect(page.getByTestId('restore-team-row')).toHaveCount(8);
    expect(await col('restore-purse')).toEqual(V3_PURSES.map(cr));
    await expect(page.getByTestId('restore-pool-total')).toContainText('4321');
    await expect(page.getByTestId('restore-pot-GK')).toHaveText('300');

    // expandable squads with RETAINED / AUCTION ACQUIRED badges and UNDERDOG tag
    const expanders = page.getByTestId('restore-expand');
    await expect(expanders.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expanders.nth(1).click();
    await expect(expanders.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('restore-squad-list')).toHaveCount(1);
    await expect(page.getByTestId('badge-retained')).toHaveCount(2);await expect(page.getByTestId('restore-price')).toHaveCount(10);
    await expect(page.getByTestId('badge-auction')).toHaveCount(8);
    await expect(page.getByTestId('underdog-tag')).toHaveCount(1);

    // CRITICAL issue: confirm disabled, then enabled after the host resolves the player
    const confirm = page.getByTestId('restore-confirm');
    await expect(page.getByTestId('restore-critical')).toContainText('Mystery Striker');
    await expect(confirm).toBeDisabled();
    await expanders.nth(0).click();
    await expect(page.getByTestId('resolver')).toHaveCount(1);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: /M\. Striker/ }).click();
    await expect(page.getByTestId('restore-valid')).toBeVisible();
    await expect(confirm).toBeEnabled();
    await expect(page.getByTestId('restore-host-team')).toHaveValue('Ritzz FC');

    // confirm sends the resolved snapshot to the restore endpoint, never the normal create path
    await confirm.click();
    await expect.poll(() => page.evaluate(() => window.calls.includes('create'))).toBe(true);
    const sent = await page.evaluate(() => window.created);
    expect(sent.auctionName).toBe('Super League Football Auction 2026');
    expect(sent.hostTeamName).toBe('Ritzz FC');
    expect(sent.snapshot.teams[0].players[0].playerId).toBe('fc26-77');
    expect(sent.settings.playerTimerSeconds).toBe(15);
    expect(await page.evaluate(() => window.calls.includes('normal createRoom'))).toBe(false);

    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);

    // toggling back OFF restores the normal flow
    await toggle.uncheck({ force: true });
    await expect(page.getByTestId('restore-workflow')).toHaveCount(0);
    await expect(page.getByText('PLAYER DATABASE SOURCE')).toBeVisible();
    await expect(page.getByRole('button', { name: /CREATE ROOM/ })).toBeVisible();
  } finally { await browser.close(); }
}

// ---- Join page: unclaimed team picker ----
for (const width of [375, 768, 1280]) {
  const { browser, page, errors } = await openPage(joinBundle, { viewport: { width, height: 900 } });
  try {
    await expect(page.getByTestId('restore-team-picker')).toHaveCount(0);
    await expect(page.getByLabel('Your Franchise / Team Name')).toBeVisible();
    await page.getByLabel('Auction Room Code').fill('normal');
    await page.getByLabel('Auction Room Code').fill('NORMAL'); // not six characters of the room alphabet, no lookup
    await page.getByLabel('Auction Room Code').fill('abc234');
    const picker = page.getByTestId('restore-team-picker');
    await expect(picker).toBeVisible();
    await expect(page.getByLabel('Your Franchise / Team Name')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: /FidoDido FC/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Ritzz FC/ })).toBeEnabled();
    await expect(picker).toContainText('Claimed');
    // a team must be chosen
    await page.getByRole('button', { name: /JOIN ROOM LOBBY/ }).click();
    await expect(page.getByText('Choose the team you will manage.').first()).toBeVisible();
    await page.getByRole('radio', { name: /DDD/ }).check();
    await page.getByRole('button', { name: /JOIN ROOM LOBBY/ }).click();
    await expect.poll(() => page.evaluate(() => window.calls.filter((c) => c.startsWith('join')))).toEqual(['join {"roomCode":"ABC234","teamName":"","restoredTeamId":"t3"}']);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}

// ---- Lobby panel, remaining pool, squad views ----
for (const width of [375, 768, 1280]) {
  const { browser, page, errors } = await openPage(viewsBundle, { viewport: { width, height: 900 } });
  try {
    const lobby = page.getByTestId('restore-lobby-panel');
    await expect(lobby).toContainText('6 / 8 CLAIMED');
    await expect(page.getByTestId('restore-unclaimed-note')).toContainText('2 teams have no manager yet');
    await expect(page.getByTestId('restore-lobby-team')).toHaveCount(8);
    expect((await page.getByTestId('restore-lobby-purse').allTextContents()).map((s) => s.trim())).toEqual(['₹59 Cr', '₹50.5 Cr', '₹0 Cr', '₹29 Cr', '₹13.5 Cr', '₹48 Cr', '₹38 Cr', '₹20 Cr']);
    expect(await page.getByTestId('restore-lobby-slots').allTextContents()).toEqual(SLOTS.map(String));
    expect(await page.getByTestId('restore-claim-state').allTextContents()).toEqual(['Claimed', 'Claimed', 'Claimed', 'Claimed', 'Claimed', 'Claimed', 'Unclaimed', 'Unclaimed']);
    // host can release claimed teams except their own (t0)
    await expect(page.getByRole('button', { name: /^Release / })).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Release Ritzz FC' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Release DDD' }).click();
    await expect.poll(() => page.evaluate(() => window.calls.includes('release ABC234 t2'))).toBe(true);

    // remaining pool: totals, paging, search
    await expect(page.getByTestId('restore-pool-summary')).toContainText('4321 players will be auctioned');
    await expect(page.getByTestId('restore-pool-list').locator('li')).toHaveCount(20);
    await expect(page.getByTestId('restore-pool-range')).toHaveText('1-20 of 45');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('restore-pool-range')).toHaveText('21-40 of 45');
    await page.getByLabel('Search the remaining pool').fill('Player 4');
    await expect(page.getByTestId('restore-pool-range')).toHaveText('1-6 of 6');

    // squad views: RETAINED vs AUCTION ACQUIRED, no invented price for restored players
    const card = page.getByTestId('squad-card').first();
    await expect(card.getByTestId('squad-size')).toHaveText('2/20');
    await expect(card.getByTestId('squad-slots-left')).toHaveText('18');
    await expect(card.getByTestId('squad-retained-player')).toHaveCount(1);
    await expect(card.getByTestId('squad-auction-player')).toHaveCount(1);
    await expect(card.getByTestId('squad-restored-price')).toHaveText([cr(15), cr(4.5)]);
    await expect(card).not.toContainText('₹5 Cr');
    await expect(card.getByTestId('underdog-tag')).toHaveCount(1);
    const mapped = await page.evaluate(() => window.mapped);
    expect(mapped[0]).toMatchObject({ claimed: true, remaining: 18, prices: ['undefined', 'undefined'], restored: [true, true], retained: [true, false] });
    expect(mapped[1]).toMatchObject({ claimed: false, connected: false, manager: 'unclaimed' });
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
{
  const { browser, page } = await openPage(viewsBundle, { viewport: { width: 1280, height: 900 } });
  try {
    await page.evaluate(() => { location.hash = '#guest'; });
    await page.reload();
    await expect(page.getByRole('button', { name: /^Release / })).toHaveCount(0); // only the host can release
  } finally { await browser.close(); }
}
// ---- v2: host binds users in the workflow ----
{
  const { browser, page, errors } = await openPage(createBundle, { viewport: { width: 1280, height: 900 } });
  try {
    await page.getByTestId('restore-toggle').check({ force: true });
    await expect(page.getByTestId('restore-manager-row')).toHaveCount(8);
    await expect(page.getByTestId('restore-workflow')).toContainText('before sharing the room code');
    await expect(page.getByTestId('manager-you')).toHaveCount(1); // host team Ritzz FC
    const row = (n) => page.locator('[data-testid="restore-manager-row"][data-team="' + n + '"]');
    const fido = row('Fidodido FC');
    await fido.getByLabel('Search registered users for Fidodido FC').fill('deb');
    await fido.getByRole('button', { name: 'Search users for Fidodido FC' }).click();
    await fido.getByRole('button', { name: /Debadrit Nag/ }).click();
    await expect(fido.getByTestId('manager-selected')).toContainText('Debadrit Nag');
    // the same user cannot be bound to a second team
    const ddd = row('DDD');
    await ddd.getByLabel('Search registered users for DDD').fill('deb');
    await ddd.getByRole('button', { name: 'Search users for DDD' }).click();
    await expect(ddd.getByRole('button', { name: /Debadrit Nag/ })).toBeDisabled();
    // resolve the unmatched player so create is allowed
    await page.getByTestId('restore-expand').nth(0).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: /M\. Striker/ }).click();
    await page.getByTestId('restore-confirm').click();
    await expect.poll(() => page.evaluate(() => window.calls.includes('create'))).toBe(true);
    const sent = await page.evaluate(() => window.created);
    expect(sent.bindings).toEqual([{ teamName: 'Fidodido FC', userId: 'u-deb' }]);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
// ---- v2: join page, reserved user and picker ----
{
  const { browser, page, errors } = await openPage(joinBundle, { viewport: { width: 375, height: 900 } });
  try {
    await page.getByLabel('Auction Room Code').fill('res234');
    await expect(page.getByTestId('restore-my-team-label')).toHaveText('Your team: Ritzz FC');
    await expect(page.getByTestId('restore-team-picker')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    const name = page.getByLabel('Team Name');
    await expect(name).toHaveValue('Ritzz FC');
    await name.fill('Ritz Slayers');
    await page.getByRole('button', { name: /JOIN ROOM LOBBY/ }).click();
    await expect.poll(() => page.evaluate(() => window.calls.filter((c) => c.startsWith('join')))).toEqual(['join {"roomCode":"RES234","teamName":"Ritz Slayers","restored":true}']);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
{
  const { browser, page } = await openPage(joinBundle, { viewport: { width: 1280, height: 900 } });
  try {
    await page.getByLabel('Auction Room Code').fill('pqr234');
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: /Ritzz FC/ })).toBeDisabled();
    await expect(page.getByTestId('restore-team-picker')).toContainText('Reserved');
    await expect(page.getByRole('radio', { name: /DDD/ })).toBeEnabled();
  } finally { await browser.close(); }
}
// ---- v2: lobby shows original name, reserved label, host bind control, and no retention UI ----
{
  const { browser, page, errors } = await openPage(viewsBundle, { viewport: { width: 1280, height: 900 } });
  try {
    await expect(page.getByTestId('restore-original-name')).toHaveText('was FidoDido FC');
    await expect(page.getByTestId('restore-reserved-label')).toContainText('Sam Roy');
    await expect(page.getByTestId('restore-bind-control')).toHaveCount(2); // t6 (reserved) and t7 (unbound); claimed teams have none
    await expect(page.getByRole('button', { name: 'Remove manager for Dakshineswar FC' })).toBeVisible();
    await page.getByLabel('Search registered users for BGT').fill('deb');
    await page.getByRole('button', { name: 'Search users for BGT' }).click();
    await page.getByRole('button', { name: /Debadrit Nag/ }).click();
    await expect.poll(() => page.evaluate(() => window.calls.includes('bind t7 u-deb'))).toBe(true);
    await expect(page.getByTestId('retention-status-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
console.log('PASS: restore toggle ON/OFF, template with 8 teams (exact purses, squads, slots), expandable squads with RETAINED/AUCTION badges, CRITICAL blocks confirm until resolved, restore create payload, host user binding with search and duplicate block, reserved join with a new name, reserved teams disabled in picker, lobby original name and bind control, join picker (claimed disabled, team required, restoredTeamId sent), lobby claim state and host-only release, remaining pool paging/search, restored players show no price, no horizontal scroll at 375/768/1280.');
