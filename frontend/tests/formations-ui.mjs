import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {TeamSheetEditor} from './src/components/manager-mode/TeamSheetEditor';
import {formationIds,getFormation} from './src/lib/formations';
const roles=getFormation('4-3-3 Holding').slots.map(s=>s.role);
const players=Array.from({length:26},(_,i)=>({id:'p'+i,name:i===0?'Alexandros Very Long Player Surname':'Player '+i,position:roles[i%11],secondaryPositions:'',overall:80+i%10,currentTeamId:'a',stats:{},metadata:{}}));
const sheet={teamId:'a',formation:'4-3-3 Holding',slots:players.slice(0,11).map(p=>p.id),bench:players.slice(11,23).map(p=>p.id),captainId:'p1',updatedAt:Date.now()};
window.ids=formationIds;window.commands=[];
function App(){const [state,setState]=useState({name:'Formation Test',myTeamId:'a',teams:[{id:'a',name:'Full Squad FC',managerUsername:'Manager'}],players,squadData:{sheets:[sheet],lineups:[],contracts:[]},seasonData:{currentSeasonId:'s2',seasons:[{id:'s2',number:2}]}});window.reset=()=>setState(s=>({...s,squadData:{...s.squadData,sheets:[{...sheet,updatedAt:Date.now()}]}}));return <main className="mx-auto max-w-6xl bg-slate-950 p-4"><TeamSheetEditor state={state} busy={false} action={async a=>{window.commands.push(a);setState(s=>({...s,squadData:{...s.squadData,sheets:[{teamId:'a',...a,updatedAt:Date.now()}]}}));}}/></main>;}createRoot(document.getElementById('root')).render(<App/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',alias:{'@':root+'src'},define:{'process.env.NODE_ENV':'"test"'}});
const styles=readdirSync(root+'.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(root+'.next/static/css/'+f,'utf8')).join('\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://formation.test/',r=>r.fulfill({contentType:'text/html',body:'<style>'+styles+'</style><div id="root"></div><script src="/test.js"></script>'}));
 await page.route('http://formation.test/test.js',r=>r.fulfill({contentType:'application/javascript',body:bundled.outputFiles[0].text}));
 await page.route('http://formation.test/images/players/**',r=>r.fulfill({contentType:'image/webp',body:readFileSync(root+'public/images/players/default-player.webp')}));
 await page.goto('http://formation.test/');
 const selector=page.getByLabel('Formation',{exact:true});await expect(selector.locator('option')).toHaveCount(34);
 for(const id of await page.evaluate(()=>window.ids)){await selector.selectOption(id);expect(await page.locator('select[aria-label^="Slot "]').count()).toBe(11);await page.getByRole('button',{name:'Save team sheet',exact:true}).click();const a=await page.evaluate(()=>window.commands.at(-1));expect(a.formation).toBe(id);const selected=[...a.slots.filter(Boolean),...a.bench];expect(new Set(selected).size).toBe(selected.length);}
 await page.getByLabel('Search formations').fill('False 9');expect(await selector.locator('option').count()).toBe(2);await selector.selectOption('4-3-3 False 9');await page.getByLabel('Search formations').fill('');await page.evaluate(()=>window.reset());
 await expect(page.getByLabel('Slot 2 ST',{exact:true})).toHaveValue('p1');
 const drag=await page.evaluateHandle(()=>{const data=new DataTransfer();data.setData('text/plain','p7');return data;});
 await page.getByLabel('Slot 1 LW',{exact:true}).locator('..').dispatchEvent('drop',{dataTransfer:drag});await expect(page.getByRole('alert')).toContainText('compatible');await expect(page.getByLabel('Slot 1 LW',{exact:true})).toHaveValue('p0');
 const data=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('text/plain','p1');return d;});
 await page.getByRole('heading',{name:'Reserves',exact:true}).locator('..').dispatchEvent('drop',{dataTransfer:data});await expect(page.getByLabel('Slot 2 ST',{exact:true})).toHaveValue('');
 await page.getByRole('heading',{name:'Reserves',exact:true}).locator('..').getByRole('button',{name:'Add to substitutes'}).first().click();await expect(page.getByRole('alert')).toContainText('twelve');
 await page.getByRole('button',{name:'Move to reserves'}).first().click();await page.getByRole('heading',{name:'Reserves',exact:true}).locator('..').getByRole('button',{name:'Add to substitutes'}).first().click();
 await page.getByLabel('Slot 2 ST',{exact:true}).selectOption('p1');await page.getByRole('button',{name:'Save team sheet',exact:true}).click();expect((await page.evaluate(()=>window.commands.at(-1))).slots[1]).toBe('p1');
 await page.evaluate(()=>window.reset());await expect(selector).toHaveValue('4-3-3 Holding');await selector.selectOption('5-4-1 Diamond');await page.getByRole('button',{name:'Save team sheet',exact:true}).click();
 mkdirSync(root+'test-results',{recursive:true});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Team Sheet PDF'}).click();const file=await download;expect(file.suggestedFilename()).toBe('Full-Squad-FC_Season-2_5-4-1-Diamond_Team-Sheet.pdf');await file.saveAs(root+'test-results/formation-full-squad.pdf');
 await page.screenshot({path:root+'test-results/formation-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'test-results/formation-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 console.log('PASS: 34 selectable/saved formations, search, compatible XI, rejected invalid drop, XI/reserve/substitute moves, bench limit, saved-state restoration, full-squad PDF filename/export and mobile overflow.');
}finally{await browser.close();}

