/** Canonical formation geometry, shared by server validation, browser editor and PDF.
 * Coordinates are percentages, attacking end at y=0. Slots stay front-to-back.
 */
const rows = {
 '3-1-4-2':[['ST','ST'],['LM','CM','CM','RM'],['CDM'],['CB','CB','CB'],['GK']],
 '3-4-1-2':[['ST','ST'],['CAM'],['LM','CM','CM','RM'],['CB','CB','CB'],['GK']],
 '3-4-2-1':[['ST'],['CF','CF'],['LM','CM','CM','RM'],['CB','CB','CB'],['GK']],
 '3-4-3 Diamond':[['LW','ST','RW'],['CAM'],['LM','RM'],['CDM'],['CB','CB','CB'],['GK']],
 '3-4-3 Flat':[['LW','ST','RW'],['LM','CM','CM','RM'],['CB','CB','CB'],['GK']],
 '3-5-1-1':[['ST'],['CF'],['LM','CM','CDM','CM','RM'],['CB','CB','CB'],['GK']],
 '3-5-2':[['ST','ST'],['LM','CM','CDM','CM','RM'],['CB','CB','CB'],['GK']],
 '4-1-2-1-2 Narrow':[['ST','ST'],['CAM'],['CM','CM'],['CDM'],['LB','CB','CB','RB'],['GK']],
 '4-1-2-1-2 Wide':[['ST','ST'],['CAM'],['LM','RM'],['CDM'],['LB','CB','CB','RB'],['GK']],
 '4-1-3-2':[['ST','ST'],['LM','CM','RM'],['CDM'],['LB','CB','CB','RB'],['GK']],
 '4-1-4-1':[['ST'],['LM','CM','CM','RM'],['CDM'],['LB','CB','CB','RB'],['GK']],
 '4-2-2-2':[['ST','ST'],['CAM','CAM'],['CDM','CDM'],['LB','CB','CB','RB'],['GK']],
 '4-2-3-1 Narrow':[['ST'],['CAM','CAM','CAM'],['CDM','CDM'],['LB','CB','CB','RB'],['GK']],
 '4-2-3-1 Wide':[['ST'],['LM','CAM','RM'],['CDM','CDM'],['LB','CB','CB','RB'],['GK']],
 '4-2-4':[['LW','ST','ST','RW'],['CM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-1-2':[['ST','ST'],['CAM'],['CM','CM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-2-1':[['ST'],['CF','CF'],['CM','CM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-3 Attack':[['LW','ST','RW'],['CM','CAM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-3 Defend':[['LW','ST','RW'],['CDM','CM','CDM'],['LB','CB','CB','RB'],['GK']],
 '4-3-3 False 9':[['LW','CF','RW'],['CM','CDM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-3 Flat':[['LW','ST','RW'],['CM','CM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-3-3 Holding':[['LW','ST','RW'],['CM','CDM','CM'],['LB','CB','CB','RB'],['GK']],
 '4-4-1-1 Attack':[['ST'],['CF'],['LM','CM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '4-4-1-1 Midfield':[['ST'],['CAM'],['LM','CM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '4-4-2 Flat':[['ST','ST'],['LM','CM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '4-4-2 Holding':[['ST','ST'],['LM','CDM','CDM','RM'],['LB','CB','CB','RB'],['GK']],
 '4-5-1 Attack':[['ST'],['CAM','CAM'],['LM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '4-5-1 Flat':[['ST'],['LM','CM','CM','CM','RM'],['LB','CB','CB','RB'],['GK']],
 '5-1-2-2':[['ST','ST'],['CM','CM'],['CDM'],['LWB','CB','CB','CB','RWB'],['GK']],
 '5-2-1-2':[['ST','ST'],['CAM'],['CM','CM'],['LWB','CB','CB','CB','RWB'],['GK']],
 '5-2-3':[['LW','ST','RW'],['CM','CM'],['LWB','CB','CB','CB','RWB'],['GK']],
 '5-3-2':[['ST','ST'],['CM','CDM','CM'],['LWB','CB','CB','CB','RWB'],['GK']],
 '5-4-1 Diamond':[['ST'],['CAM'],['LM','RM'],['CDM'],['LWB','CB','CB','CB','RWB'],['GK']],
 '5-4-1 Flat':[['ST'],['LM','CM','CM','RM'],['LWB','CB','CB','CB','RWB'],['GK']]
} as const;
export type FormationId=keyof typeof rows;
export const formationAliases={'4-3-3':'4-3-3 Holding','4-2-3-1':'4-2-3-1 Wide','4-4-2':'4-4-2 Flat','4-1-2-1-2':'4-1-2-1-2 Narrow'} as const;
export type Formation=FormationId|keyof typeof formationAliases;
export const formationIds=Object.keys(rows) as FormationId[];
export const isFormation=(value:string):value is Formation=>Object.hasOwn(rows,value)||Object.hasOwn(formationAliases,value);
export const canonicalFormation=(id:Formation):FormationId=>id in formationAliases?formationAliases[id as keyof typeof formationAliases]:id as FormationId;
export interface FormationSlot {role:string;x:number;y:number}
export function getFormation(id:Formation){
 const key=canonicalFormation(id),layout=rows[key];
 return {id:key,label:key,group:key[0]+' BACK',slots:layout.flatMap((row,r)=>row.map((role,c):FormationSlot=>({role,x:row.length===1?50:10+c*80/(row.length-1),y:9+r*82/(layout.length-1)})))};
}
// Compatibility export for existing consumers; geometry must come from getFormation.
export const formations:Record<Formation,readonly (readonly string[])[]>={...rows,'4-3-3':rows[formationAliases['4-3-3']],'4-2-3-1':rows[formationAliases['4-2-3-1']],'4-4-2':rows[formationAliases['4-4-2']],'4-1-2-1-2':rows[formationAliases['4-1-2-1-2']]};
export interface PositionedPlayer {id:string;position:string;secondaryPositions?:string|null}
const neighbors:Record<string,readonly string[]>={GK:['GK'],CB:['CB'],LB:['LB','LWB'],LWB:['LWB','LB','LM'],RB:['RB','RWB'],RWB:['RWB','RB','RM'],CDM:['CDM','CM'],CM:['CM','CDM','CAM'],CAM:['CAM','CM','CF'],LM:['LM','LW','LWB'],LW:['LW','LM','CF'],RM:['RM','RW','RWB'],RW:['RW','RM','CF'],CF:['CF','ST','CAM','LW','RW'],ST:['ST','CF']};
export function positionScore(player:PositionedPlayer,role:string){
 const positions=[player.position,...(player.secondaryPositions??'').split(/[,;|/\s]+/)].map(p=>p.toUpperCase());
 if(role==='GK')return positions[0]==='GK'?3:0;
 if(positions[0]==='GK')return 0;
 return positions[0]===role?3:positions.includes(role)?2:positions.some(p=>neighbors[role]?.includes(p))?1:0;
}
export const canPlay=(player:PositionedPlayer,role:string)=>positionScore(player,role)>0;
/** Maximum-weight assignment: retain as many selected starters as possible, then prefer
 * exact roles and stable slots. Unmatched starters join substitutes/reserves, never vanish. */
export function remapLineup(players:readonly PositionedPlayer[],previous:readonly (string|null)[],bench:readonly string[],formation:Formation){
 const selected=previous.filter((id):id is string=>!!id).map(id=>players.find(p=>p.id===id)).filter((p):p is PositionedPlayer=>!!p);
 const roles=getFormation(formation).slots;
 let states=new Map<number,{score:number;slots:(string|null)[]}>([[0,{score:0,slots:Array<string|null>(11).fill(null)}]]);
 selected.forEach(p=>{const next=new Map(states);for(const [mask,state] of states)roles.forEach((slot,i)=>{const score=positionScore(p,slot.role);if(mask&(1<<i)||!score)return;const newMask=mask|(1<<i),value=state.score+1000+score*10+(previous[i]===p.id?1:0);if(value>(next.get(newMask)?.score??-1)){const slots=[...state.slots];slots[i]=p.id;next.set(newMask,{score:value,slots});}});states=next;});
 const best=[...states.values()].reduce((a,b)=>a.score>=b.score?a:b);
 return {slots:best.slots,bench:[...new Set([...bench,...selected.filter(p=>!best.slots.includes(p.id)).map(p=>p.id)])].filter(id=>players.some(p=>p.id===id)&&!best.slots.includes(id)).slice(0,12)};
}

