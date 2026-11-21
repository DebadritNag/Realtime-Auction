/** Offline browser test of the redesigned live auction page: header, purse strip, player stage, bidding panel, activity feed, sections. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll, resultsDir } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React,{Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import LiveAuctionPage from './src/app/auction/[roomCode]/page';
import {useAuctionStore} from './src/stores/auction.store';
import {useAuthStore} from './src/stores/auth.store';
import {useConnectionStore} from './src/stores/connection.store';
import {initialServer,applyCommand,project,playerDTO,CATALOG} from './tests/retention-fixtures.mjs';
let server=initialServer();
const run=(viewer,type,payload={})=>{server=applyCommand(server,viewer,'t1',{type,payload});};
run('t1','RETAIN_PLAYER',{playerId:'1'});run('t1','RETAIN_PLAYER',{playerId:'2'});run('t1','CONFIRM_RETENTION');
run('t2','SKIP_RETENTION');run('t3','RETAIN_PLAYER',{playerId:'6'});run('t3','CONFIRM_RETENTION');run('t1','FINALIZE_RETENTIONS');
const sold=(id,teamId,price,retained)=>({id:'s-'+id,playerId:id,teamId,priceCr:price,bidCount:retained?0:3,at:5,durationMs:retained?0:9000,acquisitionType:retained?'RETENTION':'AUCTION',isRetained:retained});
const live=playerDTO('a1','Live Striker','ST',90,{status:'ACTIVE',positions:['ST','CF'],club:'Inter',nationality:'Argentina',basePriceCr:5,potId:'ATT'});
const bought=playerDTO('p2','Auction Winger','LW',84,{status:'SOLD',potId:'ATT'});
const waiting=playerDTO('w1','Waiting Forward','ST',82,{potId:'ATT'});
const soldRetained=id=>({...CATALOG.find(p=>p.id===id),status:'SOLD',potId:'ATT'});
window.liveState=(over={})=>{
 const base=project(server,'t1','t1',{sequence:over.sequence??10});
 const teams=base.teams.map(t=>t.id==='t1'?{...t,playerIds:['1','2','p2'],playersOwned:3,spentCr:39,remainingBudgetCr:161}:t.id==='t3'?{...t,playerIds:['6'],playersOwned:1,spentCr:15,remainingBudgetCr:185}:t);
 const now=Date.now();
 return {...base,status:'RUNNING',teams,currentUserTeam:teams[0],serverTime:now,activePlayerId:'a1',currentPlayer:live,activePotId:'ATT',activationId:'00000000-0000-4000-8000-000000000001',
  currentBidCr:over.bid??12,highestBidderTeamId:over.bidder??'t2',minimumNextBidCr:(over.bid??12)+2,maximumPermittedBidCr:161,biddingOpen:true,startedAt:now-5000,endsAt:over.endsAt??now+60000,remainingTimeMs:60000,bidCount:3,
  players:[soldRetained('1'),soldRetained('2'),soldRetained('6'),bought,live,waiting],soldPlayers:[sold('1','t1',15,true),sold('2','t1',15,true),sold('6','t3',15,true),sold('p2','t1',9,false)],
  playerQueue:['w1'],playerQueueSummary:{remaining:2},...(over.extra??{})};
};
window.store=useAuctionStore;
window.feed=(type,payload,seq)=>useAuctionStore.getState().handleServerEvent({type,payload,roomId:'room-1',sequence:seq,serverTime:Date.now()});
window.pushState=over=>{const s=window.liveState(over);useAuctionStore.getState().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:'room-1',sequence:s.sequence,serverTime:s.serverTime});};
useAuctionStore.setState({roomCode:'ABC234'});
useAuthStore.setState({user:{id:'u-t1',username:'mgr_t1',email:'',displayName:'Alpha',avatarUrl:'',defaultTeamName:'',defaultTeamLogo:''},isAuthenticated:true,isRestoring:false});
useConnectionStore.setState({status:'SYNCED',latencyMs:42});
const params=Promise.resolve({roomCode:'abc234'});
createRoot(document.getElementById('root')).render(<Suspense fallback={null}><LiveAuctionPage params={params}/></Suspense>);
`);
const { browser, page, errors } = await openPage(bundle, { viewport: { width: 1440, height: 1000 } });
try {
  await page.evaluate(() => window.pushState());
  await expect(page.getByTestId('auction-header')).toBeVisible();

  // A. Header.
  await expect(page.getByTestId('auction-name')).toHaveText('Champions Auction');
  await expect(page.getByTestId('auction-room-code')).toHaveText('ABC234');
  await expect(page.getByTestId('auction-phase')).toContainText('LIVE AUCTION');
  await expect(page.getByTestId('auction-pot')).toContainText('Attackers');
  await expect(page.getByTestId('auction-host-badge')).toBeVisible();
  await expect(page.getByText('LIVE SYNC')).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText([/Live Auction/, /Retained Players\s*3/, /Teams & Squads/, /Overview/]);
  await expect(page.getByRole('tab', { name: /Live Auction/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Exit', exact: true })).toBeVisible();

  // B. Purse strip.
  const cards = page.getByTestId('purse-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByTestId('purse-amount')).toHaveText('\u20B9161 Cr');
  await expect(cards.nth(0).getByTestId('purse-slots')).toHaveText('3/18 squad');
  await expect(cards.nth(0).getByTestId('purse-retained')).toContainText('2 retained');
  await expect(cards.nth(1).getByTestId('purse-retained')).toHaveCount(0);
  await expect(cards.nth(1)).toContainText('Leading');
  await expect(cards.nth(2).getByTestId('purse-retained')).toContainText('1 retained');

  // C. Player stage and bidding panel.
  await expect(page.getByTestId('player-stage')).toHaveAttribute('data-status', 'ACTIVE');
  await expect(page.getByTestId('player-stage-status')).toContainText('Bidding open');
  await expect(page.getByRole('heading', { name: 'Live Striker', exact: true })).toBeVisible();
  const stage = page.getByTestId('player-stage');
  for (const text of ['90', 'ST', 'also CF', 'Inter', 'Argentina', '\u20B95 Cr']) await expect(stage).toContainText(text);
  await expect(page.getByTestId('player-stage-summary')).toContainText('Beta FC');
  const panel = page.getByTestId('bidding-panel');
  await expect(panel).toContainText('\u20B912 Cr');
  await expect(panel).toContainText('Beta FC');
  await expect(panel).toContainText('TIME REMAINING');
  await expect(panel.getByRole('button', { name: /\(\+\d+ Cr\)$/ })).toHaveCount(3);

  // D. Activity feed: only backend events appear, newest first.
  await expect(page.getByTestId('activity-feed')).toContainText('Activity appears here');
  await page.evaluate(() => { window.feed('BID_UPDATED', { playerId: 'a1', amountCr: 14, highestBidderTeamId: 't3', minimumNextBidCr: 16, endsAt: Date.now() + 60000, bidCount: 4 }, 11); window.pushState({ sequence: 12, bid: 14, bidder: 't3' }); });
  await expect(page.getByTestId('activity-entry')).toHaveCount(1);
  await expect(page.getByTestId('activity-entry').first()).toContainText('Gamma FC bid \u20B914 Cr for Live Striker');
  await expect(page.getByTestId('activity-entry').first().locator('time')).toHaveAttribute('datetime', /\d{4}-\d\d-\d\dT/);
  await expect(panel).toContainText('\u20B914 Cr');
  await expect(cards.nth(2)).toContainText('Leading');
  await expect(cards.nth(1)).not.toContainText('Leading');

  // E. Retained Players section opens without touching live state, and the compact bar keeps the bid and timer visible.
  const before = await page.evaluate(() => ({ snap: window.store.getState().snapshot, endsAt: window.store.getState().endsAt, bid: window.store.getState().currentBid }));
  await page.evaluate(() => { window.__snapRef = window.store.getState().snapshot; });
  await page.getByRole('tab', { name: /Retained Players/ }).click();
  await expect(page.locator('#auction-panel-live')).toBeHidden();
  await expect(page.locator('#auction-panel-live')).toHaveCount(1); // still mounted
  await expect(page.locator('#auction-panel-retained')).toBeVisible();
  const retained = page.locator('#auction-panel-retained');
  await expect(retained.getByTestId('retained-team-group')).toHaveCount(3);
  await expect(retained.locator('[data-team-id="t2"]').getByTestId('retained-empty')).toHaveText('No players retained');
  await expect(retained.locator('[data-team-id="t1"]').getByTestId('retained-by').first()).toContainText('Alpha FC');
  await expect(retained.getByTestId('retained-badge')).toHaveCount(3);
  await expect(retained).toContainText('\u20B915 Cr');
  await expect(page.getByTestId('compact-bid-bar')).toBeVisible();
  await expect(page.getByTestId('compact-player')).toHaveText('Live Striker');
  await expect(page.getByTestId('compact-bid')).toHaveText('\u20B914 Cr');
  await expect(page.getByTestId('compact-timer')).toHaveText(/^[0-5]\d s$|^\d+s$/);
  const during = await page.evaluate(() => ({ same: window.__snapRef === window.store.getState().snapshot, endsAt: window.store.getState().endsAt, bid: window.store.getState().currentBid }));
  expect(during.same).toBe(true);
  expect(during.endsAt).toBe(before.endsAt);
  expect(during.bid).toBe(before.bid);
  // A bid that arrives while another section is open still updates everything.
  await page.evaluate(() => { window.feed('BID_UPDATED', { playerId: 'a1', amountCr: 16, highestBidderTeamId: 't2', minimumNextBidCr: 18, endsAt: Date.now() + 60000, bidCount: 5 }, 13); window.pushState({ sequence: 14, bid: 16, bidder: 't2' }); });
  await expect(page.getByTestId('compact-bid')).toHaveText('\u20B916 Cr');
  await page.getByRole('button', { name: /Back to live auction/ }).click();
  await expect(page.locator('#auction-panel-live')).toBeVisible();
  await expect(page.getByTestId('bidding-panel')).toContainText('\u20B916 Cr');
  await expect(page.getByTestId('activity-entry')).toHaveCount(2);

  // Sale: sold status, feed lines for the sale and the squad acquisition.
  await page.evaluate(() => {
    window.feed('PLAYER_SOLD', { playerId: 'a1', teamId: 't2', priceCr: 16, remainingBudgetCr: 184, teamPlayerCount: 1 }, 15);
  });
  await expect(page.getByTestId('player-stage')).toHaveAttribute('data-status', 'SOLD');
  await expect(page.getByTestId('activity-entry').first()).toContainText('joins the Beta FC squad');
  await expect(page.getByTestId('activity-entry').filter({ hasText: 'sold to Beta FC for \u20B916 Cr' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.evaluate(() => window.store.getState().dismissSoldOverlay());

  // F. Teams & Squads: retained and auction-acquired players are visibly separate groups.
  await page.getByRole('tab', { name: /Teams & Squads/ }).click();
  const squads = page.locator('#auction-panel-teams');
  await expect(squads.getByTestId('squad-card')).toHaveCount(3);
  const alpha = squads.locator('[data-team-id="t1"]').first();
  await expect(alpha.getByTestId('squad-size')).toHaveText('3/18');
  await expect(alpha.getByTestId('squad-slots-left')).toHaveText('15');
  await expect(alpha.getByTestId('squad-retained-count')).toHaveText('2');
  await expect(alpha.getByTestId('squad-auction-count')).toHaveText('1');
  await expect(alpha.getByTestId('squad-retained-player')).toHaveCount(2);
  await expect(alpha.getByTestId('squad-auction-player')).toHaveCount(1);
  await expect(alpha.getByTestId('squad-auction-player')).toContainText('Auction Winger');
  await expect(alpha.getByTestId('squad-purse')).toHaveText('\u20B9161 Cr');
  await expect(alpha.getByRole('img')).toHaveAttribute('aria-label', /GK \d+, DEF \d+, MID \d+, ATT \d+/);
  await page.getByRole('tab', { name: /Overview/ }).click();
  await expect(page.getByTestId('overview-sold')).toContainText('1 /');
  await expect(page.getByTestId('overview-retained')).toHaveText('3');
  await expect(page.getByTestId('overview-top')).toContainText('Auction Winger');
  await page.getByRole('tab', { name: /Live Auction/ }).click();

  // Keyboard focus is visible on the tabs.
  await page.getByRole('tab', { name: /Live Auction/ }).focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return el.getAttribute('role') + ':' + s.outlineStyle + ':' + s.outlineWidth; })).toBe('tab:solid:2px');

  // Responsive: no horizontal page scroll in any section at the four target widths.
  const dir = resultsDir();
  for (const [name, w, h] of [['mobile', 375, 800], ['tablet', 768, 1000], ['laptop', 1024, 800], ['desktop', 1440, 1000]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const tab of [/Live Auction/, /Retained Players/, /Teams & Squads/, /Overview/]) {
      await page.getByRole('tab', { name: tab }).click();
      expect(await noHorizontalScroll(page), 'auction overflows at ' + w + ' in ' + tab).toBe(true);
    }
    await page.getByRole('tab', { name: /Live Auction/ }).click();
    await expect(page.getByTestId('team-purse-strip')).toBeVisible();
    await expect(page.getByTestId('activity-feed')).toBeVisible(); // visible on every width, not only desktop
    await page.screenshot({ path: dir + 'auction-redesign-' + name + '.png', fullPage: true });
  }
  expect(errors).toEqual([]);
  console.log('PASS: header, purse strip, player stage states, bidding panel, activity feed from events, Retained Players tab keeping live state, squad overview, responsive 375/768/1024/1440.');
} finally {
  await browser.close();
}
