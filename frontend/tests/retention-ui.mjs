/** Offline browser test of the sequential retention page body (active, handover, waiting, summary views). */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RetentionScreen} from './src/components/retention/RetentionScreen';
import {retentionService} from './src/services/retention.service';
import {webSocketService} from './src/services/websocket.service';
import {initialServer,applyCommand,project,searchCatalog} from './tests/retention-fixtures.mjs';
window.commands=[];window.fetches=[];
function Harness(){
 const [server,setServer]=useState(initialServer());
 const [viewer,setViewer]=useState('t1');
 const [host,setHost]=useState('t1');
 const latest=useRef();latest.current={server,viewer,host};
 window.setViewer=setViewer;window.setHostTeam=setHost;
 window.reserveByOthers=ids=>setServer(s=>({...s,others:ids}));
 webSocketService.send=async command=>{
  const {server,viewer,host}=latest.current;window.commands.push({...command,as:viewer});
  const next=applyCommand(server,viewer,host,command);latest.current.server=next;setServer(next);
 };
 retentionService.players=async(code,query={})=>{window.fetches.push({code,...query});
  if(window.freezeCatalog&&window.lastCatalog)return window.lastCatalog;
  window.lastCatalog=searchCatalog(latest.current.server,latest.current.viewer,query);return window.lastCatalog;};
 const snapshot=project(server,viewer,host);
 return <RetentionScreen roomCode="ABC234" snapshot={snapshot} isHost={viewer===host}/>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`);
const { browser, page, errors } = await openPage(bundle);
try {
  const cards = page.getByTestId('retention-player-card');
  const confirm = page.getByRole('button', { name: 'Confirm retention', exact: true });
  // Header: auction, room code, phase, current team, manager, purses, slots, progress.
  await expect(page.getByTestId('retention-auction-name')).toContainText('Champions Auction');
  await expect(page.getByTestId('retention-room-code')).toHaveText('ABC234');
  await expect(page.getByTestId('retention-phase')).toHaveText('Retention');
  await expect(page.getByTestId('retention-team-name')).toHaveText('Alpha FC');
  await expect(page.getByTestId('retention-team-summary')).toContainText('Team 1 of 3');
  await expect(page.getByTestId('retention-team-manager')).toContainText('mgr_t1');
  await expect(page.getByTestId('retention-team-starting')).toHaveText('\u20B9200 Cr');
  await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9200 Cr');
  await expect(page.getByTestId('retention-team-spend')).toHaveText('\u20B90 Cr');
  await expect(page.getByTestId('retention-team-count')).toHaveText('0/3');
  await expect(page.getByTestId('retention-progress-count')).toHaveText('0 of 3 teams done');
  await expect(page.getByTestId('retention-progress-item')).toHaveCount(3);
  await expect(page.getByTestId('retention-progress-item').first()).toHaveAttribute('data-status', 'ACTIVE');
  await expect(page.getByTestId('retention-your-turn')).toBeVisible();

  // Player list, UNDERDOG tag, card contents.
  await expect(cards).toHaveCount(8);
  await expect(page.getByTestId('underdog-tag')).toHaveCount(1);
  const mbappe = cards.filter({ hasText: 'Kylian Mbappe' });
  for (const text of ['Real Madrid', 'France', '\u20B95 Cr', '\u20B915 Cr', '91', 'ST']) await expect(mbappe).toContainText(text);

  // Position chips match the brief and combine with search.
  for (const label of ['All', 'GK', 'CB', 'Fullbacks', 'CDM', 'CM', 'CAM', 'LM / RM', 'ST / CF', 'LW / RW'])
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search players' }).fill('madrid');
  await expect(cards).toHaveCount(3);
  await page.getByRole('button', { name: 'ST / CF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ST / CF', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Search players' }).fill('');
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Number Ten');
  await page.getByRole('searchbox', { name: 'Search players' }).fill('nation 4');
  await expect(cards).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search players' }).fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(cards).toHaveCount(8);

  // Nothing selected: confirm disabled with a hint to skip.
  await expect(confirm).toBeDisabled();
  await expect(page.getByTestId('retention-confirm-hint')).toBeVisible();
  await expect(page.getByTestId('retention-selection-empty')).toBeVisible();

  // Select, count, purse, remove, limit.
  await page.getByRole('button', { name: 'Retain Kylian Mbappe Full', exact: true }).click();
  await expect(page.getByTestId('retention-selected-player')).toHaveCount(1);
  await expect(page.getByTestId('retention-team-count')).toHaveText('1/3');
  await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9185 Cr');
  await expect(page.getByTestId('retention-team-spend')).toHaveText('\u20B915 Cr');
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'RETAIN_PLAYER', payload: { roomCode: 'ABC234', playerId: '1' } });
  await expect(cards.filter({ hasText: 'Kylian Mbappe' }).getByTestId('retention-card-selected')).toBeVisible();
  await page.getByRole('button', { name: 'Retain Gianluca Underdog Full', exact: true }).click();
  await page.getByRole('button', { name: 'Retain Left Back Full', exact: true }).click();
  await expect(page.getByTestId('retention-team-count')).toHaveText('3/3');
  await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9155 Cr');
  await expect(page.getByTestId('retention-selection-list').getByTestId('underdog-tag')).toHaveCount(1);
  const retainButtons = cards.getByRole('button', { name: /^Retain / });
  await expect(retainButtons).toHaveCount(5);
  for (const b of await retainButtons.all()) await expect(b).toBeDisabled();
  await expect(page.getByText('Retention limit reached (3/3)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove Left Back Full', exact: true }).click();
  await expect(page.getByTestId('retention-team-count')).toHaveText('2/3');
  await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9170 Cr');
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'REMOVE_RETENTION_PLAYER', payload: { playerId: '3' } });

  // A player reserved by another team becomes Unavailable and never names that team.
  await page.evaluate(() => { window.freezeCatalog = true; window.reserveByOthers(['5']); });
  const striker = cards.filter({ hasText: 'Another Striker' });
  await expect(striker.getByTestId('retention-card-unavailable')).toHaveText(/Unavailable/);
  await expect(striker).not.toContainText('Beta');
  await expect(striker.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => { window.freezeCatalog = false; window.reserveByOthers(['5', '6']); });
  await expect(striker).toHaveCount(0); // the refetched list no longer contains reserved players
  await page.evaluate(() => window.reserveByOthers([]));
  await expect(striker).toHaveCount(1);

  // Responsive checks on the active view.
  for (const [w, h] of [[375, 800], [768, 900], [1024, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    expect(await noHorizontalScroll(page), 'active view overflows at ' + w).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // Confirm locks the turn and shows the handover screen.
  await confirm.click();
  await page.getByRole('button', { name: 'Confirm and lock turn', exact: true }).click();
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'CONFIRM_RETENTION', as: 't1' });
  await expect(page.getByTestId('retention-handover-title')).toHaveText('TEAM 1 - RETENTION COMPLETE');
  await expect(page.getByTestId('retention-handover-count')).toHaveText('2/3');
  await expect(page.getByTestId('retention-handover-spent')).toHaveText('\u20B930 Cr');
  await expect(page.getByTestId('retention-handover-purse')).toHaveText('\u20B9170 Cr');
  await expect(page.getByTestId('retention-handover-next')).toContainText('NEXT UP: TEAM 2');
  await expect(page.getByTestId('retention-handover-next')).toContainText('Beta FC');
  await expect(page.getByTestId('retention-player-list')).toHaveCount(0);
  await expect(page.getByTestId('retention-progress-item').first()).toHaveAttribute('data-status', 'COMPLETED');
  // Host (Alpha) can skip an absent manager's turn.
  await page.getByRole('button', { name: "Skip Beta FC's turn", exact: true }).click();
  await page.getByRole('button', { name: 'Skip this turn', exact: true }).click();
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'SKIP_RETENTION', as: 't1' });
  await expect(page.getByTestId('retention-progress-item').nth(1)).toHaveAttribute('data-status', 'SKIPPED');

  // Team 3 is now active: a non-active team sees the waiting view without selection controls.
  await page.evaluate(() => window.setViewer('t2'));
  await expect(page.getByTestId('retention-handover-view')).toBeVisible();
  await page.evaluate(() => window.setHostTeam('t1'));
  await expect(page.getByRole('button', { name: /Skip .* turn/ })).toHaveCount(0); // t2 is not the host
  await page.evaluate(() => window.setViewer('t3'));
  await expect(page.getByTestId('retention-active-view')).toBeVisible();
  // Team 3 skips with an explicit confirmation.
  await page.getByRole('button', { name: 'Skip retention', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip retention', exact: true }).click();
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'SKIP_RETENTION', as: 't3' });

  // Summary: read-only, only the host finalizes.
  await expect(page.getByTestId('retention-all-done')).toContainText('All teams have completed retention');
  await expect(page.getByTestId('retention-summary-view')).toBeVisible();
  await expect(page.getByTestId('retention-summary-team')).toHaveCount(3);
  await expect(page.getByTestId('retention-summary-team').first()).toContainText('2/3 retained');
  await expect(page.getByTestId('retention-summary-totals')).toContainText('Total retained: 2');
  await expect(page.getByTestId('retained-player-card')).toHaveCount(2);
  await expect(page.getByTestId('retention-nonhost-note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalize retentions', exact: true })).toHaveCount(0);
  for (const [w, h] of [[375, 800], [768, 900], [1024, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    expect(await noHorizontalScroll(page), 'summary overflows at ' + w).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.setViewer('t1'));
  await page.getByRole('button', { name: 'Finalize retentions', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('finalize-total')).toContainText('Total retained: 2');
  await dialog.getByRole('button', { name: 'Finalize retentions', exact: true }).click();
  expect(await page.evaluate(() => window.commands.at(-1))).toMatchObject({ type: 'FINALIZE_RETENTIONS', as: 't1' });
  await expect(page.getByTestId('retention-finalized-badge')).toBeVisible();

  // A non-active team that has not played yet sees the waiting view after a reset.
  await page.getByRole('button', { name: 'Reset retentions', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset retentions', exact: true }).click();
  await page.evaluate(() => window.setViewer('t3'));
  await expect(page.getByTestId('retention-waiting-view')).toBeVisible();
  await expect(page.getByTestId('retention-waiting-title')).toContainText('Team 1 \u00B7 Alpha FC is choosing');
  await expect(page.getByTestId('retention-player-list')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Retain / })).toHaveCount(0);
  await expect(page.getByTestId('retained-empty').first()).toHaveText('No players retained');

  expect(errors).toEqual([]);
  console.log('PASS: retention page header, search + chips, select/remove/limit, confirm + handover, host skip, waiting view, read-only summary with host-only finalize, responsive widths.');
} finally {
  await browser.close();
}
