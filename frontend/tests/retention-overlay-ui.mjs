/** Offline browser test of the global retention announcement overlay: states A/B/C, dedupe by event id, dismissal, reduced motion. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RetentionAnnouncementOverlay} from './src/components/retention/RetentionAnnouncementOverlay';
import {useAuctionStore} from './src/stores/auction.store';
import {initialServer,applyCommand,project} from './tests/retention-fixtures.mjs';
window.store=useAuctionStore;
useAuctionStore.setState({roomCode:'ABC234'});
window.sim={
 server:initialServer(),seq:1,
 step(viewer,type,payload={}){this.server=applyCommand(this.server,viewer,'t1',{type,payload});},
 snapshot(viewer='t1'){return project(this.server,viewer,'t1',{sequence:++this.seq});},
 roomState(viewer='t1'){const s=this.snapshot(viewer);useAuctionStore.getState().handleServerEvent({type:'ROOM_STATE',payload:s,roomId:'room-1',sequence:s.sequence,serverTime:s.serverTime});},
 dispatch(type,payload){useAuctionStore.getState().handleServerEvent({type,payload,roomId:'room-1',sequence:++this.seq,serverTime:this.server.clock+1000});},
 confirmTurn(viewer,ids){for(const id of ids)this.step(viewer,'RETAIN_PLAYER',{playerId:id});this.step(viewer,ids.length?'CONFIRM_RETENTION':'SKIP_RETENTION');},
};
function Harness(){const [ms,setMs]=useState(600000);window.setAutoMs=setMs;
 return <RetentionAnnouncementOverlay autoDismissMs={{retained:ms,skipped:ms,completed:ms}}/>;}
createRoot(document.getElementById('root')).render(<Harness/>);
`);
const { browser, page, errors } = await openPage(bundle);
try {
  const overlay = page.getByTestId('retention-announcement');
  const dialog = page.getByRole('dialog');

  // The first ROOM_STATE of a fresh retention announces nothing.
  await page.evaluate(() => window.sim.roomState());
  await expect(overlay).toHaveCount(0);

  // State A: team retained players.
  await page.evaluate(() => {
    window.sim.confirmTurn('t1', ['1', '2']);
    window.eventA = window.sim.snapshot().retention.lastCompleted;
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.eventA);
  });
  await expect(overlay).toHaveCount(1);
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('announcement-title')).toHaveText('TEAM 1 RETENTION COMPLETE');
  await expect(page.getByTestId('announcement-team')).toHaveText('Alpha FC');
  await expect(page.getByTestId('announcement-player')).toHaveCount(2);
  await expect(page.getByTestId('announcement-player').first()).toContainText('Kylian Mbappe Full');
  await expect(page.getByTestId('announcement-player').first()).toContainText('91');
  await expect(page.getByTestId('announcement-player').first()).toContainText('ST');
  await expect(page.getByTestId('announcement-player').first()).toContainText('\u20B915 Cr');
  await expect(page.getByTestId('announcement-players').getByTestId('underdog-tag')).toHaveCount(1);
  await expect(page.getByTestId('announcement-spent')).toHaveText('\u20B930 Cr');
  await expect(page.getByTestId('announcement-purse')).toHaveText('\u20B9170 Cr');
  await expect(page.getByTestId('announcement-count')).toHaveText('2/3');
  await expect(page.getByTestId('announcement-next')).toContainText('NEXT UP: TEAM 2');
  await expect(page.getByTestId('announcement-next')).toContainText('Beta FC');
  await expect(page.locator('.ra-confetti')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Dismiss announcement' })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ra-confetti')).display)).not.toBe('none');

  // Replayed event (same id) never produces a second announcement, even after dismissal.
  await page.evaluate(() => window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.eventA));
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await expect(overlay).toHaveCount(0);
  await page.evaluate(() => window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.eventA));
  await expect(overlay).toHaveCount(0);
  // A ROOM_STATE that carries the same persisted turn does not replay it either.
  await page.evaluate(() => window.sim.roomState());
  await page.evaluate(() => window.sim.roomState('t2'));
  await expect(overlay).toHaveCount(0);
  expect(await page.evaluate(() => window.store.getState().retentionSeen.length)).toBe(1);

  // State B: skipped, calmer, no players and no confetti. Escape dismisses.
  await page.evaluate(() => {
    window.sim.confirmTurn('t2', []);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
  });
  await expect(page.getByTestId('announcement-title')).toHaveText('TEAM 2 HAS SKIPPED RETENTION');
  await expect(page.getByTestId('announcement-player')).toHaveCount(0);
  await expect(page.getByTestId('announcement-spent')).toHaveText('\u20B90 Cr');
  await expect(page.getByTestId('announcement-purse')).toHaveText('\u20B9200 Cr');
  await expect(page.getByTestId('announcement-next')).toContainText('NEXT UP: TEAM 3');
  await expect(page.locator('.ra-confetti')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);

  // State C: all teams completed with the overview table. Backdrop click dismisses.
  await page.evaluate(() => {
    window.sim.confirmTurn('t3', ['3']);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
  });
  await expect(page.getByTestId('announcement-title')).toHaveText('TEAM 3 RETENTION COMPLETE');
  await expect(page.getByTestId('announcement-next')).toContainText('last team');
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await page.evaluate(() => window.sim.dispatch('RETENTION_ALL_COMPLETED', window.sim.snapshot().retention.completion));
  await expect(page.getByTestId('announcement-title')).toHaveText('ALL TEAMS HAVE COMPLETED RETENTION!');
  const rows = page.getByTestId('announcement-overview').locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Alpha FC');
  await expect(rows.nth(0)).toContainText('2/3');
  await expect(rows.nth(0)).toContainText('\u20B9170 Cr');
  await expect(rows.nth(1)).toContainText('0/3');
  await expect(rows.nth(2)).toContainText('\u20B9185 Cr');
  await expect(dialog).toContainText('The host can now finalize retentions.');
  await expect(page.getByRole('link', { name: 'Go to retention summary' })).toHaveAttribute('href', '/room/ABC234/retention');
  await page.mouse.click(4, 4);
  await expect(overlay).toHaveCount(0);

  // Queue: two confirmed turns arriving together are shown one after the other.
  await page.evaluate(() => {
    window.sim.step('t1', 'RESET_RETENTIONS');
    window.sim.confirmTurn('t1', ['4']);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
    window.sim.confirmTurn('t2', ['5']);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
  });
  await expect(page.getByTestId('announcement-team')).toHaveText('Alpha FC');
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await expect(page.getByTestId('announcement-team')).toHaveText('Beta FC');
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await expect(overlay).toHaveCount(0);

  // Auto-dismiss after the configured duration.
  await page.evaluate(() => window.setAutoMs(700));
  await page.evaluate(() => {
    window.sim.confirmTurn('t3', []);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
  });
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveCount(0, { timeout: 4000 });
  await page.evaluate(() => window.setAutoMs(600000));

  // Reduced motion removes the confetti and entrance animation.
  await page.evaluate(() => {
    window.sim.step('t1', 'RESET_RETENTIONS');
    window.sim.confirmTurn('t1', ['6']);
    window.sim.dispatch('RETENTION_TEAM_CONFIRMED', window.sim.snapshot().retention.lastCompleted);
  });
  await expect(overlay).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ra-confetti')).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ra-panel')).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Responsive: the panel scrolls inside itself and never widens the page.
  for (const [w, h] of [[375, 700], [768, 900], [1024, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    expect(await noHorizontalScroll(page), 'overlay overflows at ' + w).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();

  // Refresh: seen ids persist per room and user, so a reload replays nothing. Old unseen turns are only remembered.
  await page.reload();
  await page.evaluate(() => {
    window.sim.server = JSON.parse(JSON.stringify(window.__server ?? window.sim.server));
  });
  await page.evaluate(() => {
    window.sim.step('t1', 'RETAIN_PLAYER', { playerId: '1' });
    window.sim.step('t1', 'CONFIRM_RETENTION');
    // The turn was seen before the reload (same id 'turn-1' stored in localStorage).
    window.sim.roomState();
  });
  await expect(overlay).toHaveCount(0);
  // A turn that finished long ago and was never seen is not announced on reconnect.
  await page.evaluate(() => {
    window.sim.server.turns[0].id = 'turn-old';
    window.sim.server.turns[0].at = window.sim.server.clock - 600000;
    window.sim.roomState();
  });
  await expect(overlay).toHaveCount(0);
  // A fresh unseen turn (reconnect during the announcement window) is announced exactly once.
  await page.evaluate(() => {
    window.sim.step('t2', 'SKIP_RETENTION');
    window.sim.server.turns[1].id = 'turn-fresh';
    window.sim.roomState();
    window.sim.roomState();
  });
  await expect(overlay).toHaveCount(1);
  await expect(page.getByTestId('announcement-title')).toHaveText('TEAM 2 HAS SKIPPED RETENTION');
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await expect(overlay).toHaveCount(0);

  expect(errors).toEqual([]);
  console.log('PASS: overlay states A/B/C, dedupe by event id (replay, ROOM_STATE, reload), queue, dismiss by button/Escape/backdrop/auto, reduced motion, responsive.');
} finally {
  await browser.close();
}
