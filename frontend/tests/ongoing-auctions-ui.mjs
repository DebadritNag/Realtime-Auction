/** Offline browser test for YOUR ONGOING AUCTIONS and Rejoin. No network, accounts or production data. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OngoingAuctionsSection} from './src/components/home/OngoingAuctionsSection';
import {RejoinAuctionCard} from './src/components/home/RejoinAuctionCard';
import {roomService} from './src/services/room.service';
window.calls=[];
const base={roomId:'r',roomCode:'ABC234',auctionName:'Long League Auction Name',rawStatus:'LOBBY',retention:null,teamCount:3,capacity:8,
 role:{isHost:true,teamId:'t1',teamName:'Reds'},round:null,category:null,currentPlayer:null,playersSold:0,playersRetained:0,playersUnsold:0,
 playersRemaining:null,lastActivityAt:Date.now()-5*60000,createdAt:0,canContinue:true,serverTime:Date.now()};
const statuses=['NOT_STARTED','WAITING_FOR_TEAMS','RETENTION_IN_PROGRESS','READY_TO_START','LIVE_AUCTION','PAUSED','COMPLETED','CANCELLED'];
const rooms=statuses.map((s,i)=>({...base,roomId:'r'+i,roomCode:'AAAA'+(i+2)+'2',ongoingStatus:s,resumePath:'/auction/AAAA'+(i+2)+'2',
 ...(s==='LIVE_AUCTION'?{round:2,category:'GK',playersSold:4,playersRemaining:20,role:{isHost:false,teamId:'t2',teamName:'Blues'},
  currentPlayer:{id:'p',name:'Alisson',position:'GK',potId:'GK',currentBidCr:7.5,highestBidderTeamName:'Reds',endsAt:null,remainingTimeMs:null}}:{})}));
roomService.myRooms=async()=>{window.calls.push('GET myRooms');if(window.failList)throw new Error('Server unavailable');return {rooms:window.emptyList?[]:rooms,serverTime:Date.now()};};
roomService.summary=async code=>{window.calls.push('GET summary '+code);return {...rooms[4],teams:[{id:'t1',name:'Reds',managerUsername:'ann',isHost:true,remainingBudgetCr:90,playersOwned:3,retainedCount:1,connected:true}]};};
roomService.rejoin=async code=>{window.calls.push('POST rejoin '+code);if(code==='BADBAD')throw new Error('You are not a member of this auction. Use Join Auction Room to join a lobby.');return {...rooms[4],resumePath:'/auction/'+code};};
createRoot(document.getElementById('root')).render(<div style={{padding:12}}><OngoingAuctionsSection/><RejoinAuctionCard/></div>);
`);

for (const width of [375, 768, 1280]) {
  const { browser, page, errors } = await openPage(bundle, { viewport: { width, height: 900 } });
  try {
    await expect(page.getByRole('heading', { name: 'YOUR ONGOING AUCTIONS' })).toBeVisible();
    // completed and cancelled are never listed; the 6 unfinished statuses are.
    await expect(page.getByTestId('ongoing-card')).toHaveCount(6);
    const labels = await page.getByTestId('ongoing-status').allTextContents();
    expect(labels).toEqual(['NOT STARTED', 'WAITING FOR TEAMS', 'RETENTION IN PROGRESS', 'READY TO START', 'LIVE AUCTION', 'PAUSED']);
    const live = page.locator('[data-room-code="AAAA62"]');
    for (const text of ['Room AAAA62', '3 teams', 'Blues', 'Round 2', 'Goalkeepers', 'Alisson', 'Reds', 'Sold: 4', 'Remaining: 20', '5 min ago'])
      await expect(live).toContainText(text);
    await page.getByRole('button', { name: 'View Details' }).nth(4).click();
    await expect(page.getByTestId('ongoing-details')).toContainText('Reds (Host)');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Continue Auction' }).first().click();
    const calls = await page.evaluate(() => window.calls);
    expect(calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
    // rejoin: success uses only the code; server errors are shown
    await page.getByLabel('Room code').fill('badbad');
    await page.getByRole('button', { name: 'Rejoin Auction' }).click();
    await expect(page.getByRole('alert')).toContainText('You are not a member of this auction');
    await page.getByLabel('Room code').fill('abc234');
    await page.getByRole('button', { name: 'Rejoin Auction' }).click();
    await expect.poll(() => page.evaluate(() => window.calls.includes('POST rejoin ABC234'))).toBe(true);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
for (const mode of ['emptyList', 'failList']) {
  const { browser, page } = await openPage(bundle, { viewport: { width: 375, height: 800 } });
  try {
    await page.evaluate((m) => { window[m] = true; window.dispatchEvent(new Event('focus')); }, mode);
    await expect(mode === 'emptyList' ? page.getByTestId('ongoing-empty') : page.getByRole('alert').first()).toBeVisible();
  } finally { await browser.close(); }
}
console.log('PASS: ongoing auctions list (6 statuses, no completed/cancelled), card fields, read-only View Details, Continue without mutations, rejoin success/error, empty and error states, no horizontal scroll at 375/768/1280.');
