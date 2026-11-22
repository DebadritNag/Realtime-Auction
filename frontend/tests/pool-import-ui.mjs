/** Offline component/browser test for the live "add players" UI. No network, accounts or production data. */
import { build } from '../../backend/node_modules/esbuild/lib/main.js';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {HostAuctionControls} from './src/components/auction/HostAuctionControls';
import {PlayerPoolSidebar} from './src/components/auction/PlayerPoolSidebar';
import {webSocketService} from './src/services/websocket.service';
import {poolImportService} from './src/services/pool-import.service';
window.calls=[];window.commands=[];window.failCommit=false;
const row=(o)=>({row:1,playerId:'p',name:'P',ovr:80,potId:'ATT',code:'ELIGIBLE',reason:'Eligible',...o});
const rows=[row({row:2,playerId:'n1',name:'New Striker',status:'ELIGIBLE',underdog:true}),
 row({row:3,playerId:'d1',name:'Dup Player',status:'SKIPPED',code:'SOLD',reason:'Already sold'}),
 row({row:4,playerId:'x',name:'Bad Row',status:'REJECTED',code:'INVALID',reason:'overall must be a number'})];
const totals=(added)=>({totalRecords:3,eligible:1,added,skipped:1,rejected:1,byReason:{}});
poolImportService.preview=async(code,body)=>{window.calls.push({kind:'preview',code,body});return {mode:'PREVIEW',sequence:5,totals:totals(0),rows};};
poolImportService.commit=async(code,body,batchId)=>{window.calls.push({kind:'commit',code,body,batchId});if(window.failCommit)throw new Error('Host only');return {mode:'COMMIT',batchId,sequence:6,totals:totals(1),rows};};
webSocketService.send=async c=>{window.commands.push(c);};
const mk=(o)=>({id:'a',name:'Alpha',club:'FC',position:'ATT',ovr:80,pot:'ATT',basePrice:3,status:'waiting',...o});
const players=[mk({id:'a',name:'Alpha',isNew:true,playerTag:'UNDERDOG'}),mk({id:'b',name:'Bravo'})];
const base={hasActivePlayer:true,hasBid:false,synced:true,canRecall:true,unsoldPlayers:[],roomCode:'ABC234',isPaused:false,onPause(){},onResume(){},onSkip(){},onEnd(){}};
function App(){return <div>
 <section id="host"><HostAuctionControls {...base} canAddPlayers poolSource="FC26" heldAdditions={2}/></section>
 <section id="other"><HostAuctionControls {...base}/></section>
 <PlayerPoolSidebar players={players} currentPot="ATT"/>
</div>;}
createRoot(document.getElementById('root')).render(<App/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await page.route('http://pool.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/test.js"></script>'}));
 await page.route('http://pool.test/test.js',r=>r.fulfill({contentType:'application/javascript',body:compiled.outputFiles[0].text}));
 await page.goto('http://pool.test/');
 // Visibility: only the host-wired controls expose the action.
 await expect(page.locator('#host').getByRole('button',{name:'+ ADD PLAYERS TO AUCTION'})).toBeVisible();
 await expect(page.locator('#other').getByRole('button',{name:'+ ADD PLAYERS TO AUCTION'})).toHaveCount(0);
 // NEW badge beside UNDERDOG, and not on a regular player.
 const alpha=page.locator('.auction-player-row',{hasText:'Alpha'});
 await expect(alpha.getByTestId('new-tag')).toBeVisible();await expect(alpha.getByTestId('underdog-tag')).toBeVisible();
 await expect(page.locator('.auction-player-row',{hasText:'Bravo'}).getByTestId('new-tag')).toHaveCount(0);
 await page.getByTestId('new-filter').click();
 await expect(page.locator('.auction-player-row')).toHaveCount(1);
 await page.getByTestId('new-filter').click();
 // Import flow.
 await page.locator('#host').getByRole('button',{name:'+ ADD PLAYERS TO AUCTION'}).click();
 await expect(page.getByRole('button',{name:'Preview',exact:true})).toBeDisabled();
 await page.getByLabel('CSV file').setInputFiles({name:'extra.csv',mimeType:'text/csv',buffer:Buffer.from('player_id,overall\n1,80\n')});
 await expect(page.getByTestId('csv-file-name')).toHaveText('extra.csv');
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 await expect(page.getByTestId('import-row')).toHaveCount(3);
 await expect(page.getByText('Already sold',{exact:true})).toBeVisible();
 await expect(page.getByText('overall must be a number',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.calls.map(c=>c.kind))).toEqual(['preview']);
 // Failed commit shows an alert and can be retried with the same batch id.
 await page.evaluate(()=>{window.failCommit=true;});
 await page.getByRole('button',{name:'Confirm import (1)'}).click();
 await expect(page.getByRole('alert')).toHaveText('Host only');
 await page.evaluate(()=>{window.failCommit=false;});
 await page.getByRole('button',{name:'Confirm import (1)'}).click();
 await expect(page.getByText('IMPORT COMPLETED',{exact:true})).toBeVisible();
 await expect(page.getByTestId('sum-total')).toHaveText('3');
 await expect(page.getByTestId('sum-added')).toHaveText('1');
 await expect(page.getByTestId('sum-skipped')).toHaveText('1');
 await expect(page.getByTestId('sum-rejected')).toHaveText('1');
 await expect(page.getByTestId('import-row')).toHaveCount(2);
 await page.getByRole('button',{name:'View new players'}).click();
 await expect(page.getByTestId('import-row')).toHaveCount(3);
 const calls=await page.evaluate(()=>window.calls);
 const commits=calls.filter(c=>c.kind==='commit');
 expect(commits.length).toBe(2);expect(commits[0].batchId).toBe(commits[1].batchId);
 expect(commits[0].body).toEqual({source:'CSV',fileName:'extra.csv',csv:'player_id,overall\n1,80\n'});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 // Release held players.
 await page.getByRole('button',{name:'Release held players (2)'}).click();
 expect(await page.evaluate(()=>window.commands)).toEqual([]);
 await page.getByRole('button',{name:'Release players',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.commands)).toEqual([{type:'RELEASE_POOL_ADDITIONS',payload:{roomCode:'ABC234'}}]);
 expect(errors).toEqual([]);
 console.log('PASS: host-only add button, NEW beside UNDERDOG, preview rows with reasons, single idempotent commit, IMPORT COMPLETED summary, new player list, release command.');
} finally {await browser.close();}
