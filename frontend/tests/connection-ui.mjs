/** Offline browser test for the host connection panel, host controls additions and ConnectionStatus states. */
import { expect } from '@playwright/test';
import { bundleEntry, openPage, noHorizontalScroll } from './ui-harness.mjs';

const bundle = await bundleEntry(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {HostConnectionPanel} from './src/components/auction/HostConnectionPanel';
import {HostAuctionControls} from './src/components/auction/HostAuctionControls';
import {ConnectionStatus} from './src/components/auction/ConnectionStatus';
import {useAuctionStore} from './src/stores/auction.store';
window.calls=[];
useAuctionStore.setState({snapshot:{teams:[{id:'t1',name:'Reds'},{id:'t2',name:'Blues'}],
 teamPresence:[{teamId:'t1',managerUsername:'ann',connected:true,lastSeenAt:Date.now()},{teamId:'t2',managerUsername:'bob',connected:false,lastSeenAt:Date.now()-120000}]}});
window.setHostless=()=>useAuctionStore.setState({snapshot:{teams:[{id:'t1',name:'Reds'}]}});
const noop=()=>{};
createRoot(document.getElementById('root')).render(<div style={{padding:12}}>
 <HostConnectionPanel isHost/><HostConnectionPanel isHost={false}/>
 <HostAuctionControls hasActivePlayer={false} hasBid={false} synced canRecall={false} unsoldPlayers={[]} roomCode="ABC234" isPaused={false}
  onPause={noop} onResume={noop} onSkip={noop} onEnd={()=>window.calls.push('end')} onViewHistory={()=>window.calls.push('history')} onReturnToDashboard={()=>window.calls.push('dashboard')}/>
 <ConnectionStatus status="LOST"/>
</div>);
`);

for (const width of [375, 768, 1280]) {
  const { browser, page, errors } = await openPage(bundle, { viewport: { width, height: 900 } });
  try {
    const panel = page.getByTestId('host-connection-panel');
    await expect(panel).toHaveCount(1);
    await expect(panel).toContainText('1/2 connected');
    await panel.getByRole('button', { name: /Team connections/ }).click(); // collapsed by default
    await expect(panel.getByText('CONNECTED', { exact: true }).locator('visible=true')).toHaveCount(1);
    await expect(panel.getByText('DISCONNECTED', { exact: true }).locator('visible=true')).toHaveCount(1);
    await expect(panel.getByText(/2 min ago/).locator('visible=true')).toHaveCount(1);
    await page.keyboard.press('Escape'); // the details popover closes and no longer covers the controls
    await expect(panel.getByText('CONNECTED', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reconnect to Auction' })).toBeVisible();
    await page.getByRole('button', { name: 'View Auction History' }).click();
    await page.getByRole('button', { name: 'Return to Dashboard' }).click();
    await page.getByRole('button', { name: 'End Auction', exact: true }).click();
    await expect(page.getByText('End Entire Auction?')).toBeVisible();
    expect(await page.evaluate(() => window.calls)).toEqual(['history', 'dashboard']);
    await page.getByRole('button', { name: 'End Auction Now' }).click();
    expect(await page.evaluate(() => window.calls)).toEqual(['history', 'dashboard', 'end']);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
console.log('PASS: host connection panel (connected/disconnected/last seen), non-host renders nothing, history and dashboard controls, End Auction confirmation, LOST reconnect button, no horizontal scroll at 375/768/1280.');
