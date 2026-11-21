/** Offline component/browser test. No external accounts, credentials or production data. */
import { build } from '../../backend/node_modules/esbuild/lib/main.js';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RetentionScreen} from './src/components/retention/RetentionScreen';
import {retentionService} from './src/services/retention.service';
import {webSocketService} from './src/services/websocket.service';
const player=(id,name,club,nationality,pos,ovr,extra={})=>({id,name,fullName:name+' Full',club,nationality,position:pos==='GK'?'GK':['LB','CB'].includes(pos)?'DEF':['CM'].includes(pos)?'MID':'FWD',
 subPosition:pos,positions:[pos],ovr,stats:{},basePriceCr:ovr>=90?5:3,potId:'ATT',retentionPriceCr:15,retainedByTeamId:null,...extra});
const catalog=[
 player('1','Kylian Mbappe','Real Madrid','France','ST',91),
 player('2','Gianluca Underdog','Lecce','Italy','GK',80,{playerTag:'UNDERDOG',draftPool:'UNDERDOG',basePriceCr:1}),
 player('3','Left Back','Chelsea','England','LB',84),
 player('4','Midfield Maestro','Barcelona','Spain','CM',87),
 player('5','Another Striker','Real Madrid','Brazil','ST',86),
 player('6','Madrid Winger','Real Madrid','Spain','LW',85),
];
const groups={ALL:null,GK:['GK'],CB:['CB'],FB:['LB','RB','LWB','RWB'],CM:['CDM','CM','CAM'],WM:['LM','RM'],ST:['ST','CF'],W:['LW','RW','LF','RF']};
const teams=[{id:'t1',userId:'u1',name:'Alpha FC',managerUsername:'alice',startingBudgetCr:200,remainingBudgetCr:200,playerIds:[],playersOwned:0},
 {id:'t2',userId:'u2',name:'Beta FC',managerUsername:'bob',startingBudgetCr:200,remainingBudgetCr:200,playerIds:[],playersOwned:0}];
const initial={roomCode:'ABC234',teams,currentUserTeam:teams[0],retention:{enabled:true,config:{priceCr:15,maxPerTeam:3,minPerTeam:0},phase:'OPEN',picks:[],
 teams:teams.map(t=>({teamId:t.id,retainedCount:0,remainingSlots:3,spentCr:0,remainingPurseCr:200})),totals:{retained:0,spentCr:0},finalizedAt:null}};
function withPicks(s,picks,phase){
 const mine=picks.filter(p=>p.teamId==='t1');
 return {...s,retention:{...s.retention,phase,picks,teams:s.retention.teams.map(t=>t.teamId==='t1'?{...t,retainedCount:mine.length,remainingSlots:3-mine.length,spentCr:mine.length*15,remainingPurseCr:200-mine.length*15}:t),
  totals:{retained:picks.length,spentCr:picks.length*15}}};
}
window.commands=[];window.fetches=[];
let state=initial;
function Harness(){const [snap,setSnap]=useState(initial);const [host,setHost]=useState(true);
 window.setHost=setHost;
 state=snap;
 webSocketService.send=async command=>{window.commands.push(command);
  if(command.type==='RETAIN_PLAYER'){const p=catalog.find(x=>x.id===command.payload.playerId);
   const picks=[...state.retention.picks,{id:'pick-'+p.id,teamId:'t1',playerId:p.id,priceCr:15,at:Date.now(),player:p}];
   setSnap(withPicks(state,picks,state.retention.phase));}
  if(command.type==='FINALIZE_RETENTIONS')setSnap(withPicks(state,state.retention.picks,'FINALIZED'));
  if(command.type==='RESET_RETENTIONS')setSnap(withPicks(state,[],'OPEN'));
 };
 retentionService.players=async (code,query={})=>{
  window.fetches.push({code,...query});
  const q=(query.search||'').toLowerCase();const g=groups[query.group||'ALL'];
  const taken=new Set(state.retention.picks.map(p=>p.playerId));
  const found=catalog.filter(p=>!taken.has(p.id)&&(!g||p.positions.some(x=>g.includes(x)))&&(!q||[p.name,p.club,p.nationality,p.id,...p.positions].join(' ').toLowerCase().includes(q)));
  return {total:found.length,offset:0,limit:50,retentionPriceCr:15,players:found};
 };
 return <RetentionScreen roomCode="ABC234" snapshot={snap} isHost={host}/>;}
createRoot(document.getElementById('root')).render(<Harness/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await page.route('http://retention.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/test.js"></script>'}));
 await page.route('http://retention.test/test.js',r=>r.fulfill({contentType:'application/javascript',body:compiled.outputFiles[0].text}));
 await page.goto('http://retention.test/');
 const cards=page.getByTestId('retention-player-card');
 // Heading, team summary and list.
 await expect(page.getByRole('heading',{name:'Player Retention'})).toBeVisible();
 await expect(cards).toHaveCount(6);
 await expect(page.getByTestId('retention-team-name')).toHaveText('Alpha FC');
 await expect(page.getByTestId('retention-team-manager')).toContainText('alice');
 await expect(page.getByTestId('retention-team-count')).toHaveText('0/3');
 await expect(page.getByTestId('retention-team-slots')).toHaveText('3');
 await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9200 Cr');
 await expect(page.getByTestId('retained-panel')).toContainText('No players retained (0)');
 // UNDERDOG tag only for the underdog player.
 await expect(page.getByTestId('underdog-tag')).toHaveCount(1);
 await expect(cards.filter({hasText:'Gianluca Underdog'}).getByTestId('underdog-tag')).toHaveCount(1);
 await expect(cards.filter({hasText:'Kylian Mbappe'}).getByTestId('underdog-tag')).toHaveCount(0);
 // Card content: price, retention price, club, nationality, position, overall.
 const mbappe=cards.filter({hasText:'Kylian Mbappe'});
 await expect(mbappe).toContainText('Real Madrid');
 await expect(mbappe).toContainText('France');
 await expect(mbappe).toContainText('\u20B95 Cr');
 await expect(mbappe).toContainText('\u20B915 Cr');
 // Search and position chips combine.
 await page.getByRole('searchbox',{name:'Search players'}).fill('madrid');
 await expect(cards).toHaveCount(3);
 await page.getByRole('button',{name:'ST / CF',exact:true}).click();
 await expect(page.getByRole('button',{name:'ST / CF',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(cards).toHaveCount(2);
 await expect(page.getByTestId('retention-player-list')).not.toContainText('Madrid Winger');
 await page.getByRole('searchbox',{name:'Search players'}).fill('');
 await expect(cards).toHaveCount(2);
 await page.getByRole('button',{name:'All',exact:true}).click();
 await expect(cards).toHaveCount(6);
 // Non-host never sees the finalize control; host does.
 await page.evaluate(()=>window.setHost(false));
 await expect(page.getByRole('button',{name:'Finalize retentions',exact:true})).toHaveCount(0);
 await expect(page.getByTestId('retention-nonhost-note')).toBeVisible();
 await page.evaluate(()=>window.setHost(true));
 await expect(page.getByRole('button',{name:'Finalize retentions',exact:true})).toBeVisible();
 // Retain requires confirmation; nothing is sent until confirmed.
 await page.getByRole('button',{name:'Retain Kylian Mbappe Full',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>window.commands)).toEqual([]);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Retain Kylian Mbappe Full',exact:true}).click();
 await page.getByRole('button',{name:'Retain for \u20B915 Cr',exact:true}).click();
 await expect(page.getByTestId('retention-team-count')).toHaveText('1/3');
 await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9185 Cr');
 await expect(page.getByTestId('retention-team-slots')).toHaveText('2');
 await expect(page.getByTestId('retained-panel')).toContainText('Kylian Mbappe');
 await expect(cards).toHaveCount(5);
 expect(await page.evaluate(()=>window.commands.at(-1))).toEqual({type:'RETAIN_PLAYER',payload:{roomCode:'ABC234',playerId:'1'}});
 // Retaining an underdog shows the tag in the retained list too.
 for(const name of ['Gianluca Underdog Full','Left Back Full']){
  await page.getByRole('button',{name:'Retain '+name,exact:true}).click();
  await page.getByRole('button',{name:'Retain for \u20B915 Cr',exact:true}).click();
 }
 await expect(page.getByTestId('retention-team-count')).toHaveText('3/3');
 await expect(page.getByTestId('retention-team-purse')).toHaveText('\u20B9155 Cr');
 await expect(page.getByTestId('retained-panel').getByTestId('underdog-tag')).toHaveCount(1);
 // The fourth retain is disabled with a reason.
 const remainingButtons=cards.getByRole('button',{name:/^Retain /});
 await expect(remainingButtons).toHaveCount(3);
 for(const button of await remainingButtons.all())await expect(button).toBeDisabled();
 await expect(page.getByText('Retention limit reached (3/3)').first()).toBeVisible();
 // Other teams are read-only.
 await page.getByRole('tab',{name:/Beta FC/}).click();
 await expect(page.getByTestId('retention-team-name')).toHaveText('Beta FC');
 await expect(page.getByTestId('retention-team-count')).toHaveText('0/3');
 await expect(page.getByText("Only this team's manager can retain").first()).toBeVisible();
 await page.getByRole('tab',{name:/Alpha FC/}).click();
 // Finalize dialog shows the summary and locks retention.
 await page.getByRole('button',{name:'Finalize retentions',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByTestId('finalize-total')).toContainText('Total retained: 3');
 await expect(dialog).toContainText('Alpha FC');
 await expect(dialog).toContainText('Beta FC');
 await dialog.getByRole('button',{name:'Finalize retentions',exact:true}).click();
 await expect(page.getByTestId('retention-finalized-badge')).toBeVisible();
 expect(await page.evaluate(()=>window.commands.at(-1))).toEqual({type:'FINALIZE_RETENTIONS',payload:{roomCode:'ABC234'}});
 await expect(page.getByRole('button',{name:'Finalize retentions',exact:true})).toHaveCount(0);
 await expect(page.getByText('Retention is finalized').first()).toBeVisible();
 expect(errors).toEqual([]);
 console.log('PASS: team summary, UNDERDOG tag only for underdogs, search + position chips combined, retain confirmation, 4th retain disabled, read-only other teams, host-only finalize dialog.');
} finally {await browser.close();}
