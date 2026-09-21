/** Offline browser/component test. No Supabase credentials or production data. */
import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SkipPlayerVote} from './src/components/auction/SkipPlayerVote';
import {webSocketService} from './src/services/websocket.service';
function Test(){const [s,set]=useState({roomCode:'ABC234',activePlayerId:'player-1',activationId:'00000000-0000-4000-8000-000000000001',status:'RUNNING',biddingOpen:true,highestBidderTeamId:null,skipVote:{votes:0,required:3,hasCurrentUserVoted:false}});const [host,setHost]=useState(false);const [synced,setSynced]=useState(true);const [notice,setNotice]=useState(null);
window.patch=patch=>set(s=>({...s,...patch}));window.setHost=setHost;window.setSynced=setSynced;window.setNotice=setNotice;
webSocketService.send=async command=>{window.commands.push(command);if(window.fail)throw Error('Vote was rejected');set(s=>({...s,skipVote:{...s.skipVote,votes:command.type==='VOTE_SKIP_PLAYER'?1:0,hasCurrentUserVoted:command.type==='VOTE_SKIP_PLAYER'}}));};
return <SkipPlayerVote snapshot={s} synced={synced} isHost={host} notice={notice}/>;}
window.commands=[];createRoot(document.getElementById('root')).render(<Test/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://skip.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/test.js"></script>'}));
 await page.route('http://skip.test/test.js',r=>r.fulfill({contentType:'application/javascript',body:result.outputFiles[0].text}));
 await page.goto('http://skip.test/');
 await expect(page.getByRole('status')).toHaveText('Skip votes: 0 / 3');
 await page.getByRole('button',{name:'Skip Player',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Skip votes: 1 / 3');
 expect(await page.evaluate(()=>window.commands[0])).toEqual({type:'VOTE_SKIP_PLAYER',payload:{roomCode:'ABC234',playerId:'player-1',activationId:'00000000-0000-4000-8000-000000000001'}});
 await page.getByRole('button',{name:'Remove Skip Vote'}).click();await expect(page.getByRole('status')).toHaveText('Skip votes: 0 / 3');
 expect(await page.evaluate(()=>window.commands[1].type)).toBe('REMOVE_SKIP_VOTE');
 await page.evaluate(()=>window.patch({status:'PAUSED'}));await expect(page.getByRole('button')).toBeDisabled();
 await page.evaluate(()=>{window.patch({status:'RUNNING'});window.setSynced(false);});await expect(page.getByRole('button')).toBeDisabled();
 await page.evaluate(()=>{window.setSynced(true);window.setHost(true);});await expect(page.getByRole('button')).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('Skip votes: 0 / 3');
 await page.evaluate(()=>{window.setHost(false);window.patch({highestBidderTeamId:'host-team'});window.setNotice('Skip votes reset after a valid bid.');});
 await expect(page.getByRole('button')).toBeDisabled();await expect(page.getByText('Skip votes reset after a valid bid.')).toBeVisible();
 await page.evaluate(()=>{window.patch({highestBidderTeamId:null});window.fail=true;});await page.getByRole('button').click();await expect(page.getByRole('alert')).toHaveText('Vote was rejected');
 await page.evaluate(()=>window.patch({activePlayerId:null}));await expect(page.getByRole('button')).toHaveCount(0);
 await page.evaluate(()=>window.patch({activePlayerId:'new',skipVote:{votes:0,required:0,hasCurrentUserVoted:false}}));await expect(page.getByRole('button')).toHaveCount(0);
 expect(errors).toEqual([]);console.log('PASS: vote/cancel command identity, authoritative count, paused/disconnected disable, host exclusion, bid reset feedback, rejection, resolved/zero-voter hiding.');
}finally{await browser.close();}
