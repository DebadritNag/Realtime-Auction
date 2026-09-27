import {readFileSync} from 'node:fs';
import type {HeroIdentity} from './hero.types.js';
// This server-only asset is deliberately outside frontend/public and all client imports.
const rows=readFileSync(new URL('../../../../data/secret-heroes/hero-player-data.csv',import.meta.url),'utf8').trim().split(/\r?\n/);
if(rows.shift()!=='name,position')throw Error('Hero catalogue must contain only name and position');
export const heroCatalog:readonly HeroIdentity[]=rows.map(row=>{
 const [name,position,...extra]=row.split(',');
 if(!name||!position||extra.length||!['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'].includes(position))throw Error('Invalid private Hero catalogue');
 return Object.freeze({name,position});
});
if(new Set(heroCatalog.map(p=>p.name)).size!==heroCatalog.length)throw Error('Duplicate Hero');
