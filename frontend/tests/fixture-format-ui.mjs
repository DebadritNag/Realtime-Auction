import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {FixtureFormatControl} from './src/components/manager-mode/FixtureFormatControl';
const fixtures=Array.from({length:28},(_,i)=>({id:String(i),matchday:Math.floor(i/4)+1,status:i===0?'COMPLETED':'SCHEDULED'}));
function App(){const [state,setState]=useState({format:'SINGLE_ROUND_ROBIN',status:'ACTIVE',teams:Array(8).fill({}),fixtures,seasonData:{currentSeasonId:'s',seasons:[{id:'s',status:'ACTIVE'}]}});window.update=setState;window.attempts=[];return <FixtureFormatControl state={state} busy={false} action={async action=>{window.attempts.push(action);if(!window.failed){window.failed=true;throw Error('Temporary server failure');}setState(s=>({...s,format:action.format,fixtures:[...fixtures,...fixtures.map(f=>({...f,id:'reverse'+f.id,matchday:f.matchday+7,status:'SCHEDULED'}))]}));}}/>;}createRoot(document.getElementById('root')).render(<App/>);
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.getByText('7 matchdays · 28 matches · 1 completed')).toBeVisible();
 await page.getByRole('button',{name:'Double',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('14 matchdays · 56 matches');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>window.attempts.length)).toBe(0);
 await page.getByRole('button',{name:'Double',exact:true}).click();await page.getByRole('button',{name:'Upgrade to Double',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Temporary server failure');await expect(page.getByRole('button',{name:'Upgrade to Double',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Upgrade to Double',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByText('14 matchdays · 56 matches · 1 completed')).toBeVisible();await expect(page.getByRole('button',{name:'Single',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Double',exact:true})).toBeDisabled();
 await page.evaluate(()=>window.update(s=>({...s,fixtures:s.fixtures.slice(0,28)})));await expect(page.getByRole('button',{name:'Repair Double Schedule'})).toBeEnabled();
 expect(errors).toEqual([]);console.log('PASS: counts, confirmation/cancel, retry after error, upgraded snapshot, downgrade protection and legacy double repair.');
}finally{await browser.close();}
