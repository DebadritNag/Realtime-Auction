/** Offline component/browser test. No external accounts, credentials or production data. */
import { build } from '../../backend/node_modules/esbuild/lib/main.js';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HostAuctionControls} from './src/components/auction/HostAuctionControls';
import {webSocketService} from './src/services/websocket.service';
const initial=[{id:'kane',name:'Harry Kane',club:'Bayern',subPosition:'ST',ovr:90,basePriceCr:9,round:1,status:'UNSOLD'},
{id:'modric',name:'Luka Modric',club:'Milan',subPosition:'CM',ovr:87,basePriceCr:7,round:1,status:'UNSOLD'}];
function Harness(){const [players,setPlayers]=useState(initial);const [paused,setPaused]=useState(false);
webSocketService.send=async command=>{window.commands.push(command); if(window.failRecall)throw new Error('Server rejected stale selection');setPlayers(p=>p.filter(x=>!command.payload.playerIds.includes(x.id)));};
window.removePlayer=id=>setPlayers(p=>p.filter(x=>x.id!==id));
return <HostAuctionControls hasActivePlayer hasBid={false} synced canRecall unsoldPlayers={players} roomCode="ABC234"
isPaused={paused} onPause={()=>setPaused(true)} onResume={()=>setPaused(false)} onSkip={()=>{}} onEnd={()=>{}}/>;}
window.commands=[];createRoot(document.getElementById('root')).render(<Harness/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://recall.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/test.js"></script>'}));
 await page.route('http://recall.test/test.js',r=>r.fulfill({contentType:'application/javascript',body:compiled.outputFiles[0].text}));
 await page.goto('http://recall.test/');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Recall Player (2)',exact:true}).click();
 await expect(page.getByRole('button',{name:'RECALL SELECTED',exact:true})).toBeDisabled();
 await page.getByRole('textbox',{name:'Search unsold players'}).fill('KAN');
 await expect(page.getByRole('checkbox',{name:'Harry Kane'})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Luka Modric'})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Harry Kane'}).check();
 await page.getByRole('textbox').fill('mod');
 await page.getByRole('button',{name:'Select All Filtered'}).click();
 await page.getByRole('textbox').fill('');
 await expect(page.getByRole('checkbox',{name:'Harry Kane'})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Luka Modric'})).toBeChecked();
 await page.getByRole('button',{name:'RECALL SELECTED',exact:true}).click();
 await expect(page.getByText('Recall 2 players back into the auction pool?',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.commands)).toEqual([]);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Clear Selection'}).click();
 await page.getByRole('checkbox',{name:'Harry Kane'}).check();
 await page.evaluate(()=>window.removePlayer('kane'));
 await expect(page.getByRole('button',{name:'RECALL SELECTED',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Luka Modric'}).check();
 await page.evaluate(()=>window.failRecall=true);
 await page.getByRole('button',{name:'RECALL SELECTED',exact:true}).click();
 await page.getByRole('button',{name:'Recall Players',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Server rejected stale selection');
 await page.evaluate(()=>window.failRecall=false);
 await page.getByRole('button',{name:'RECALL SELECTED',exact:true}).click();
 await page.getByRole('button',{name:'Recall Players',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Recall Player (0)',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.commands.at(-1))).toEqual({type:'RECALL_PLAYERS',payload:{roomCode:'ABC234',playerIds:['modric']}});
 await page.getByRole('button',{name:'End Auction',exact:true}).click();
 await expect(page.getByText('End Entire Auction?',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
 console.log('PASS: recall while paused, case-insensitive search, persistent checkbox selection, bulk selection, confirmation/cancel, pruning stale players, server error, successful close and separate End Auction.');
} finally {await browser.close();}
