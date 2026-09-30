import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CupTrophy3D} from './src/components/manager-mode/trophies/CupTrophy3D';createRoot(document.getElementById('root')).render(<><h1>Cup controls remain available</h1><CupTrophy3D variant="LEAGUE_SHIELD"/><button>Enter match result</button></>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'dynamic',setup(b){b.onResolve({filter:/^next\/dynamic$/},()=>({path:'dynamic',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({resolveDir:root,contents:'import React from "react";export default loader=>React.lazy(loader);'}));}}]});
const css=readdirSync(root+'.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(root+'.next/static/css/'+f,'utf8')).join('\n');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
async function open({failure=false,noWebGL=false,reducedMotion='reduce',touch=false}={}){
 const page=await browser.newPage({viewport:{width:touch?390:800,height:700},hasTouch:touch,isMobile:touch,reducedMotion});
 if(noWebGL)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.includes('webgl')?null:get.call(this,kind,...args);};});
 await page.route('https://viewer.test/',r=>r.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body style="background:#0b1729;color:white"><div id="root"></div><script src="/app.js"></script></body>`}));
 await page.route('https://viewer.test/app.js',r=>r.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
 await page.route('https://viewer.test/models/trophies/league-shield.glb',r=>r.fulfill(failure?{status:404,body:'Model unavailable'}:{contentType:'model/gltf-binary',body:readFileSync(root+'public/models/trophies/league-shield.glb')}));
 await page.goto('https://viewer.test/');return page;
}
try{
 const page=await open();await expect(page.locator('canvas')).toHaveCount(1);await expect(page.getByText('Preparing the trophy…')).toHaveCount(0,{timeout:30000});await expect(page.getByRole('button',{name:'Pause',exact:true})).toHaveCount(0);
 const canvas=page.locator('canvas'),box=await canvas.boundingBox();const before=await canvas.screenshot();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+25,{steps:12});await page.mouse.up();await expect.poll(async()=>!(await canvas.screenshot()).equals(before)).toBe(true);
 await canvas.evaluate(el=>el.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());await expect(page.getByText('League Shield · 3D preview unavailable')).toBeVisible();await expect(page.getByRole('button',{name:'Enter match result'})).toBeVisible();await page.close();
 for(const options of [{failure:true},{noWebGL:true}]){const fallback=await open(options);await expect(fallback.getByText('League Shield · 3D preview unavailable')).toBeVisible({timeout:30000});await expect(fallback.getByRole('button',{name:'Enter match result'})).toBeVisible();await fallback.close();}
 const mobile=await open({touch:true});await expect(mobile.getByText('Drag to rotate',{exact:true})).toBeVisible();await expect(mobile.locator('canvas')).toHaveCount(1);expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mobile.close();
 console.log('PASS: League Shield GLB, drag rotation, reduced motion, touch layout, context loss, missing model and unavailable WebGL preserve Cup controls.');
}finally{await browser.close();}
