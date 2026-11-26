/**
 * Offline browser test of the live auction room LAYOUT at 1024x500, 1280x720, 1440x900 and 375x812.
 * Host/non-host, live/paused, restored and retention-off rooms with 8 teams and a large pool.
 * Env: SHOT_PREFIX (default "after") names screenshots in .agents/tasks/auction-ui-fix/, LAYOUT_ASSERT=0 only takes screenshots.
 */
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { bundleEntry, openPage, noHorizontalScroll, root } from './ui-harness.mjs';
const prefix = process.env.SHOT_PREFIX || 'after';
const assertions = process.env.LAYOUT_ASSERT !== '0';
const shotDir = root + '../.agents/tasks/auction-ui-fix/';
mkdirSync(shotDir, { recursive: true });
const bundle = await bundleEntry(`
import React,{Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import LiveAuctionPage from './src/app/auction/[roomCode]/page';
import {useAuctionStore} from './src/stores/auction.store';
import {useAuthStore} from './src/stores/auth.store';
import {useConnectionStore} from './src/stores/connection.store';
import {initialServer,applyCommand,project,playerDTO,teamDTO} from './tests/retention-fixtures.mjs';
const NAMES=['Ritzz FC','Alpha FC','Beta FC','Gamma FC','Delta FC','Epsilon FC','Zeta FC','Eta FC'];
const POTS=['CB','GK','FB','MID','ATT'];
const POS={CB:'CB',GK:'GK',FB:'RB',MID:'CM',ATT:'ST'};
window.liveState=(o={})=>{
 const base=project(initialServer(),'t1','t1',{sequence:10});
 const teams=NAMES.map((n,i)=>{
  const id='t'+(i+1), ids=[], sold=[];
  const retained=o.retention===false?0:(i<2?1:0);
  for(let k=0;k<9;k++) ids.push('sq'+i+'-'+k);
  return teamDTO(id,{name:n,managerUsername:'mgr_'+id,userId:'u-'+id,playerIds:ids,playersOwned:ids.length,spentCr:60,remainingBudgetCr:140,retainedCount:retained});
 });
 const pool=[]; const soldPlayers=[];
 teams.forEach((t,i)=>t.playerIds.forEach((pid,k)=>{
  const pot=POTS[k%5];
  pool.push(playerDTO(pid,'Squad '+i+'-'+k,POS[pot],80+k,{status:'SOLD',potId:pot,soldToTeamId:t.id,soldPriceCr:5}));
  soldPlayers.push({id:'s-'+pid,playerId:pid,teamId:t.id,priceCr:o.restored?null:5,bidCount:k===0&&retainedFlag(i,o)?0:2,at:5,durationMs:0,acquisitionType:k===0&&retainedFlag(i,o)?'RETENTION':'AUCTION',isRetained:k===0&&retainedFlag(i,o),...(o.restored?{restoredFromSnapshot:true,recordedPriceCr:5}:{})});
 }));
 function retainedFlag(i,o){return o.retention!==false&&i<2;}
 for(let k=0;k<40;k++){const pot=POTS[k%5];pool.push(playerDTO('w'+k,'Pool Player '+k,POS[pot],70+(k%15),{potId:pot,status:k%7===0?'UNSOLD':'WAITING'}));}
 const live=playerDTO('a1','Declan Rice','CM',87,{status:'ACTIVE',positions:['CM','CDM'],club:'Arsenal',nationality:'England',basePriceCr:3,potId:'MID',playerTag:'UNDERDOG',stats:{pac:75,sho:83,pas:87,dri:87,def:50,phy:65}});
 pool.push(live);
 const now=Date.now(); const paused=o.paused!==false;
 return {...base,status:paused?'PAUSED':'RUNNING',teams,currentUserTeam:teams[o.viewer===2?1:0],serverTime:now,activePlayerId:'a1',currentPlayer:live,activePotId:'MID',
  activationId:'00000000-0000-4000-8000-000000000001',currentBidCr:3,highestBidderTeamId:null,minimumNextBidCr:3,maximumPermittedBidCr:140,biddingOpen:!paused,startedAt:now-5000,
  endsAt:paused?null:now+11000,remainingTimeMs:11000,bidCount:0,players:pool,soldPlayers,playerQueue:[],playerQueueSummary:{remaining:40},
  teamPresence:teams.map((t,i)=>({teamId:t.id,managerUsername:t.managerUsername,connected:true,lastSeenAt:now})),
  retention:o.retention===false?{...base.retention,enabled:false,picks:[],turns:[],completion:null}:base.retention};
};
window.mount=(o={})=>{
 useAuctionStore.setState({roomCode:'ABC234'});
 useAuthStore.setState({user:{id:o.viewer===2?'u-t2':'u-t1',username:'mgr',email:'',displayName:'Alpha',avatarUrl:'',defaultTeamName:'',defaultTeamLogo:''},isAuthenticated:true,isRestoring:false});
 useConnectionStore.setState({status:'SYNCED',latencyMs:42});
 const s=window.liveState(o);
 useAuctionStore.getState().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:'room-1',sequence:s.sequence,serverTime:s.serverTime});
 createRoot(document.getElementById('root')).render(<Suspense fallback={null}><LiveAuctionPage params={Promise.resolve({roomCode:'abc234'})}/></Suspense>);
};
`);
const scenarios = [
  { name: 'host-paused-restored', opts: { paused: true, restored: true } },
  { name: 'host-live', opts: { paused: false } },
  { name: 'guest-live', opts: { paused: false, viewer: 2 } },
  { name: 'host-live-noretention', opts: { paused: false, retention: false } },
];
const sizes = [[1024, 500], [1280, 720], [1440, 900], [375, 812]];
for (const sc of scenarios) {
  for (const [width, height] of sizes) {
    const { browser, page, errors } = await openPage(bundle, { viewport: { width, height } });
    try {
      await page.evaluate((o) => window.mount(o), sc.opts);
      await expect(page.getByTestId('auction-header')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shotDir + prefix + '-' + sc.name + '-' + width + 'x' + height + '.png' });
      if (assertions) {
        const host = !!sc.opts.paused !== undefined && sc.name.startsWith('host');
        const inView = async (loc, label) => {
          const box = await loc.boundingBox();
          expect(box, label + ' has a box').not.toBeNull();
          expect(box.y, label + ' top').toBeGreaterThanOrEqual(-1);
          expect(box.y + box.height, label + ' bottom within viewport (' + width + 'x' + height + ')').toBeLessThanOrEqual(height + 1);
        };
        expect(await noHorizontalScroll(page), 'no horizontal overflow').toBe(true);
        const nameEl = page.locator('.live-player-bio h2', { hasText: 'Declan Rice' });
        await expect(nameEl).toBeVisible();
        if (width >= 1024) {
          // Desktop: no page scroll; player identity and the whole bid console fit the viewport.
          expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'page scroll overflow px (' + sc.name + ' ' + width + 'x' + height + ')').toBeLessThanOrEqual(1);
          await inView(nameEl, 'player name');
          const quick = page.getByTestId('bidding-panel').locator('.auction-quick-bids button').first();
          await expect(quick).toBeVisible();
          await inView(quick, 'quick raise');
          // The bid console is not clipped by its scroll parent.
          const clip = await page.evaluate(() => { const c = document.querySelector('.auction-center'); const q = c.querySelector('.auction-quick-bids'); const n = c.querySelector('.live-player-bio h2');
            return { scrollTop: c.scrollTop, quick: c.getBoundingClientRect().bottom - q.getBoundingClientRect().bottom, name: n.getBoundingClientRect().top - c.getBoundingClientRect().top }; });
          const where = ' (' + sc.name + ' ' + width + 'x' + height + ')';
          expect(clip.scrollTop, 'center column not scrolled' + where).toBe(0);
          expect(clip.quick, 'quick raise inside the visible center column' + where).toBeGreaterThanOrEqual(-1);
          expect(clip.name, 'player name inside the visible center column' + where).toBeGreaterThanOrEqual(0);
          // No dead space below the main area.
          const gridBottom = await page.evaluate(() => document.querySelector('.auction-grid').getBoundingClientRect().bottom);
          expect(gridBottom, 'grid reaches the viewport bottom (' + sc.name + ' ' + width + 'x' + height + ')').toBeGreaterThanOrEqual(height - 20);
        }
        if (host) {
          const panel = page.getByTestId('host-connection-panel');
          const box = await panel.boundingBox();
          expect(box.height, 'connection panel collapsed').toBeLessThan(60);
          await expect(panel).toContainText('8/8 connected');
          await expect(panel.getByRole('button', { name: /Team connections/ })).toHaveAttribute('aria-expanded', 'false');
        } else {
          await expect(page.getByTestId('host-connection-panel')).toHaveCount(0);
        }
        if (sc.opts.paused) await expect(page.getByTestId('paused-notice')).toBeVisible();
        if (width < 640) {
          // Mobile: current player then bid, then everything else.
          const y = async (l) => (await l.boundingBox()).y;
          expect(await y(nameEl)).toBeLessThan(await y(page.getByTestId('bidding-panel')));
          expect(await y(page.getByTestId('bidding-panel'))).toBeLessThan(await y(page.getByTestId('squad-overview-mine')));
        }
        expect(errors).toEqual([]);
      }
    } finally { await browser.close(); }
  }
}
// Expanding the host panel shows every team, and it stays keyboard operable.
{
  const { browser, page, errors } = await openPage(bundle, { viewport: { width: 1024, height: 500 } });
  try {
    await page.evaluate(() => window.mount({ paused: true }));
    const toggle = page.getByTestId('host-connection-panel').getByRole('button', { name: /Team connections/ });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('host-connection-panel').getByText('CONNECTED', { exact: true }).locator('visible=true')).toHaveCount(8);
    await page.screenshot({ path: shotDir + prefix + '-host-panel-expanded-1024x500.png' });
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
console.log('PASS: live auction layout at 1024x500, 1280x720, 1440x900 and 375x812 (host paused restored, host live, guest, retention off).');
