import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {CupSettingsPanel,ManagerCup,TrophyGallery} from './src/components/manager-mode/ManagerCups';
const teams=['Debadrit FC','Barca','Madrid','Milan','Arsenal','Bayern'].map((name,i)=>({id:'t'+i,name,logoUrl:'',managerUsername:'Manager '+i,transferBudgetUnits:200}));
const row=(i)=>({teamId:'t'+i,position:i+1,played:2,won:1,drawn:1,lost:0,gf:4,ga:2,gd:2,points:4});
const fixture={id:'f',seasonId:'s',homeTeamId:'t0',awayTeamId:'t1',homeScore:null,awayScore:null,status:'SCHEDULED',matchday:1,stage:'GROUP',group:'A',leg:1};
const cup={id:'c',seasonId:'s',status:'GROUP_STAGE',settings:{enabled:true,name:'Manager Mode Cup',qualifiedTeams:6,groupStage:true,groupMeetings:1,semiFinalLegs:2,finalLegs:1,thirdPlace:true},qualified:teams.map((_,i)=>row(i)),groups:[{name:'A',teamIds:['t0','t2','t4']},{name:'B',teamIds:['t1','t3','t5']}],fixtures:[fixture],ties:[],lineups:[],finishes:{},standings:[{name:'A',rows:[row(0),row(2),row(4)]},{name:'B',rows:[row(1),row(3),row(5)]}]};
const state={id:'tournament',sequence:1,status:'ACTIVE',modeStatus:'ACTIVE',isHost:true,myTeamId:'t0',teams,players:[],fixtures:[],seasonData:{currentSeasonId:'s',seasons:[{id:'s',number:2,status:'COMPLETED'}]},cupData:{competitions:[cup],trophies:[]}};
window.actions=[];window.api={get:async(path)=>path.endsWith('/cups')?[cup]:path.endsWith('/scorers')?{eligibleByTeam:{t0:[],t1:[]}}:teams.map((t,i)=>({teamId:t.id,trophies:i===0?[{id:'shield',type:'LEAGUE_SHIELD',name:'League Shield',seasonId:'s'}]:[],record:row(i),playersBought:18,playersSold:2,playersTraded:1,transferSpendingUnits:150,transferIncomeUnits:20,netSpendUnits:130,bonusUnits:30,currentBudgetUnits:200,seasons:[{seasonId:'s',number:2,leaguePosition:i+1,leagueWinner:i===0,cupFinish:'In progress',bonusUnits:30}]}))};
const action=async a=>window.actions.push(a);
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl space-y-10 p-4"><CupSettingsPanel state={{...state,cupData:undefined}} action={action} busy={false}/><ManagerCup state={state} action={action} busy={false}/><TrophyGallery state={state}/></main>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'api',setup(b){b.onResolve({filter:/services\/api$/},()=>({path:'api',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const api={get:(...args)=>window.api.get(...args)};',loader:'js'}));}}]});
const css=readdirSync(root+'.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(root+'.next/static/css/'+f,'utf8')).join('\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cups.test/',r=>r.fulfill({contentType:'text/html',body:'<style>'+css+'</style><body style="background:#050d19;color:#e2e8f0"><div id="root"></div><script src="/app.js"></script></body>'}));await page.route('https://cups.test/app.js',r=>r.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));await page.goto('https://cups.test/');
 await expect(page.getByLabel('Cup name',{exact:true})).toHaveCount(0);await page.getByRole('checkbox',{name:'Cup competition OFF'}).check();await expect(page.getByLabel('Cup name',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Save Cup settings'}).click();expect(await page.evaluate(()=>window.actions[0])).toMatchObject({type:'CUP_SETTINGS',settings:{enabled:true,qualifiedTeams:6}});
 await page.getByRole('tab',{name:'Groups',exact:true}).click();await expect(page.getByRole('table')).toHaveCount(2);await expect(page.getByRole('heading',{name:'Group A'})).toBeVisible();
 await page.getByRole('tab',{name:'Fixtures',exact:true}).click();await page.getByRole('button',{name:'Enter Result',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();expect(await page.evaluate(()=>window.actions.at(-1))).toMatchObject({type:'CUP_SCORE',fixtureId:'f',homeScore:0,awayScore:0});
 await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.getByRole('button',{name:'View Debadrit FC history'}).click();await expect(page.getByRole('heading',{name:'Debadrit FC · Club history'})).toBeVisible();await expect(page.getByText('League ShieldSeason 2',{exact:true})).toBeVisible();
 mkdirSync(root+'test-results',{recursive:true});await page.screenshot({path:root+'test-results/cups-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:root+'test-results/cups-mobile.png',fullPage:true});await page.getByRole('button',{name:'My club',exact:true}).click();await expect(page.getByRole('button',{name:/View .* history/})).toHaveCount(1);expect(errors).toEqual([]);
 console.log('PASS: Cup toggle/settings, group tables, reused result editor, Cup scoring action, trophy wall, club detail, My Club filter, desktop/mobile layout.');
}finally{await browser.close();}
