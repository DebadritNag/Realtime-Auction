/** Offline browser test of the Retained Players panel and the retained badges / acquisition lines used across screens. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RetainedPlayersPanel} from './src/components/retention/RetainedPlayersPanel';
import {AcquisitionBadge} from './src/components/shared/AcquisitionBadge';
import {PurseBreakdown} from './src/components/shared/PurseBreakdown';
import {TransferTable} from './src/components/results/TransferTable';
import {TeamResultCard} from './src/components/results/TeamResultCard';
import {initialServer,applyCommand,project} from './tests/retention-fixtures.mjs';
let server=initialServer();
const run=(viewer,type,payload={})=>{server=applyCommand(server,viewer,'t1',{type,payload});};
run('t1','RETAIN_PLAYER',{playerId:'1'});run('t1','RETAIN_PLAYER',{playerId:'2'});run('t1','CONFIRM_RETENTION');
run('t2','SKIP_RETENTION');
run('t3','RETAIN_PLAYER',{playerId:'6'});run('t3','CONFIRM_RETENTION');
run('t1','FINALIZE_RETENTIONS');
const snap=project(server,'t1','t1');
const teams=snap.teams.map(t=>({id:t.id,name:t.name}));
const retainedPlayer={id:'1',name:'Kylian Mbappe',ovr:91,position:'ATT',subPosition:'ST',club:'Real Madrid',nationality:'France',flagEmoji:'',age:null,preferredFoot:null,basePrice:5,stats:{},pot:'ATT',status:'sold',isRetained:true,soldPrice:15,soldToTeamName:'Alpha FC'};
const normal={...retainedPlayer,id:'9',name:'Auction Buy',isRetained:false,soldPrice:9};
const team={id:'t1',name:'Alpha FC',shortName:'AF',logo:'AF',accentColor:'#0f0',managerId:'u',managerUsername:'mgr',budgetTotal:200,budgetSpent:24,budgetRemaining:176,squadCount:2,squad:[retainedPlayer,normal],
 positions:{gk:0,def:0,mid:0,att:2,total:2},ready:false,connected:true,retainedCount:1,retentionSpent:15,auctionPurse:185};
createRoot(document.getElementById('root')).render(<main style={{padding:16}}>
 <div id="panel"><RetainedPlayersPanel picks={snap.retention.picks} teams={teams} currentTeamId="t1" heading="Retained players"/></div>
 <div id="badges">
  <AcquisitionBadge retained/>
  <AcquisitionBadge retained variant="detail" teamName="Alpha FC" costCr={15}/>
  <AcquisitionBadge retained={false} variant="detail" teamName="Nobody"/>
  <PurseBreakdown team={team}/>
  <PurseBreakdown team={{...team,retainedCount:0,retentionSpent:0}}/>
 </div>
 <div id="results">
  <TransferTable transfers={[{player:retainedPlayer,teamName:'Alpha FC',price:15,timestamp:1},{player:normal,teamName:'Alpha FC',price:9,timestamp:2}]}/>
  <TeamResultCard team={team} roomCode="ABC234"/>
 </div>
</main>);
`);
const { browser, page, errors } = await openPage(bundle);
try {
  const panel = page.locator('#panel');
  await expect(panel.getByTestId('retained-team-group')).toHaveCount(3);
  await expect(panel.getByTestId('retained-total')).toHaveText('3 total');
  const alpha = panel.locator('[data-team-id="t1"]');
  const beta = panel.locator('[data-team-id="t2"]');
  const gamma = panel.locator('[data-team-id="t3"]');
  await expect(alpha.getByTestId('retained-player-card')).toHaveCount(2);
  await expect(alpha).toContainText('Alpha FC');
  await expect(alpha).toContainText('2/3');
  await expect(alpha).toContainText('You');
  await expect(beta.getByTestId('retained-empty')).toHaveText('No players retained');
  await expect(beta.getByTestId('retained-player-card')).toHaveCount(0);
  await expect(gamma.getByTestId('retained-player-card')).toHaveCount(1);
  const mbappe = alpha.getByTestId('retained-player-card').filter({ hasText: 'Kylian Mbappe' });
  await expect(mbappe).toContainText('91');
  await expect(mbappe).toContainText('ST');
  await expect(mbappe).toContainText('Real Madrid');
  await expect(mbappe.getByTestId('retained-by')).toHaveText('Retained by Alpha FC');
  await expect(mbappe.getByTestId('retained-badge')).toHaveText('Retained');
  await expect(mbappe).toContainText('\u20B915 Cr');
  await expect(gamma.getByTestId('retained-by')).toHaveText('Retained by Gamma FC');
  await expect(alpha.getByTestId('underdog-tag')).toHaveCount(1);
  await expect(panel.getByTestId('retained-badge')).toHaveCount(3);

  // Shared acquisition components.
  const badges = page.locator('#badges');
  await expect(badges.getByTestId('retained-badge')).toHaveCount(1);
  const detail = badges.getByTestId('acquisition-detail');
  await expect(detail).toHaveCount(1); // not rendered for non-retained players
  await expect(detail).toContainText('Acquisition Type');
  await expect(detail).toContainText('Retention');
  await expect(detail).toContainText('Acquired By');
  await expect(detail).toContainText('Alpha FC');
  await expect(detail).toContainText('Acquisition Cost');
  await expect(detail).toContainText('\u20B915 Cr');
  const breakdown = badges.getByTestId('purse-breakdown');
  await expect(breakdown).toHaveCount(1); // hidden when the team retained nobody
  await expect(breakdown).toContainText('Starting purse\u20B9200 Cr');
  await expect(breakdown).toContainText('Retention spend\u20B915 Cr');
  await expect(breakdown).toContainText('Auction spend\u20B99 Cr');
  await expect(breakdown).toContainText('Remaining purse\u20B9176 Cr');

  // Results surfaces.
  const results = page.locator('#results');
  await expect(results.locator('tbody tr').first().getByTestId('retained-badge')).toBeVisible();
  await expect(results.locator('tbody tr').first().getByTestId('acquisition-detail')).toContainText('Alpha FC');
  await expect(results.locator('tbody tr').nth(1).getByTestId('retained-badge')).toHaveCount(0);
  await expect(results.getByTestId('result-retained-list')).toContainText('Kylian Mbappe');
  await expect(results.getByTestId('purse-breakdown')).toContainText('Retention spend\u20B915 Cr');

  for (const [w, h] of [[375, 800], [768, 900], [1024, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await expect(panel.getByTestId('retained-team-group').first()).toBeVisible();
    // The transfer table scrolls inside its own container, so only check the panel itself.
    const fits = await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'panel overflows at ' + w).toBe(true);
  }
  void noHorizontalScroll;
  expect(errors).toEqual([]);
  console.log('PASS: retained panel groups every team incl. empty, RETAINED badge, retained-by team, 15 Cr, acquisition detail lines, purse breakdown, results surfaces.');
} finally {
  await browser.close();
}
