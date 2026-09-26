/** Regression for bodyless DELETE and normalized backend errors; no credentials or network. */
import {build} from '../../backend/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({entryPoints:[root+'src/services/api.ts'],bundle:true,write:false,platform:'node',format:'cjs',define:{'process.env.NEXT_PUBLIC_API_URL':'"https://backend.example"'},plugins:[{name:'test-auth',setup(b){b.onResolve({filter:/auth\.service$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const authService={getAccessToken:async()=>"test-token"};',loader:'js'}));}}]});
const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
const previous=globalThis.fetch;const requests=[];
try{globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response(null,{status:204});};await module.exports.api.delete('/manager-mode/test');const request=requests[0];assert.equal(request.options.method,'DELETE');assert.equal(request.options.body,undefined);assert.equal(request.options.headers.has('Content-Type'),false);assert.equal(request.options.headers.get('Authorization'),'Bearer test-token');
await module.exports.api.post('/manager-mode/test/actions',{requestId:'test'});assert.equal(requests[1].options.headers.get('Content-Type'),'application/json');
globalThis.fetch=async()=>Response.json({error:{code:'HOST_ONLY',message:'Only the host can delete.'}},{status:403});await assert.rejects(module.exports.api.delete('/manager-mode/test'),e=>e.code==='HOST_ONLY'&&e.status===403);
console.log('PASS: bodyless DELETE headers, JSON POST headers, token attachment, 204 response and server error preservation.');}finally{globalThis.fetch=previous;}
