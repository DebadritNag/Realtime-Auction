import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {formationIds,formationAliases,getFormation,isFormation,canPlay,remapLineup} from '../src/domain/formations.js';
import {actionSchema} from '../src/modules/manager-mode/manager.schemas.js';
it('provides all 34 formations, eleven unique bounded slots, one goalkeeper and accepted commands',()=>{
 expect(formationIds).toHaveLength(34);
 const sql=readFileSync(new URL('../../supabase/migrations/20260926185656_manager_formation_library.sql',import.meta.url),'utf8');
 for(const id of formationIds){const f=getFormation(id);expect(f.slots).toHaveLength(11);expect(f.slots.filter(s=>s.role==='GK')).toHaveLength(1);expect(new Set(f.slots.map(s=>`${s.x},${s.y}`)).size).toBe(11);for(const s of f.slots){expect(s.x).toBeGreaterThanOrEqual(9);expect(s.x).toBeLessThanOrEqual(91);expect(s.y).toBeGreaterThanOrEqual(9);expect(s.y).toBeLessThanOrEqual(91);}expect(actionSchema.safeParse({type:'SAVE_TEAM_SHEET',formation:id,slots:Array(11).fill(null),bench:[],captainId:null}).success).toBe(true);expect(sql).toContain("'"+id+"'");}
 expect(isFormation('__proto__')).toBe(false);expect(isFormation('4-7-9')).toBe(false);
});
it('preserves the exact role order of legacy saved sheets',()=>{
 for(const [old,current] of Object.entries(formationAliases)){expect(getFormation(old as keyof typeof formationAliases)).toEqual(getFormation(current));}
 expect(getFormation('4-3-3').slots.map(s=>s.role)).toEqual(['LW','ST','RW','CM','CDM','CM','LB','CB','CB','RB','GK']);
});
it('uses secondary positions and reasonable neighboring roles without allowing goalkeeper or center-back exploits',()=>{
 const p={id:'p',position:'LB',secondaryPositions:'LM, LWB'};
 expect(canPlay(p,'LWB')).toBe(true);expect(canPlay(p,'LW')).toBe(true);expect(canPlay(p,'ST')).toBe(false);
 expect(canPlay({id:'c',position:'CB'},'LW')).toBe(false);
 expect(canPlay({id:'g',position:'GK',secondaryPositions:'ST'},'ST')).toBe(false);
 expect(canPlay({id:'s',position:'ST',secondaryPositions:'GK'},'GK')).toBe(false);
});
it('remaps XI by compatibility, keeps every player in XI/substitutes/reserves and never duplicates',()=>{
 const from=getFormation('4-3-3');const players=from.slots.map((s,i)=>({id:String(i),position:s.role}));
 for(const id of formationIds){const mapped=remapLineup(players,players.map(p=>p.id),[],id);const all=[...mapped.slots.filter(Boolean),...mapped.bench];expect(new Set(all).size).toBe(all.length);expect(all).toHaveLength(11);mapped.slots.forEach((p,i)=>{if(p)expect(canPlay(players.find(x=>x.id===p)!,getFormation(id).slots[i]!.role)).toBe(true);});expect(mapped.slots[10]).toBe('10');}
 const fullBench=Array.from({length:12},(_,i)=>({id:'b'+i,position:'CM'}));const mapped=remapLineup([...players,...fullBench],players.map(p=>p.id),fullBench.map(p=>p.id),'5-4-1 Flat');expect(mapped.bench).toHaveLength(12);expect(new Set([...mapped.slots.filter(Boolean),...mapped.bench]).size).toBe(mapped.slots.filter(Boolean).length+12);
});
