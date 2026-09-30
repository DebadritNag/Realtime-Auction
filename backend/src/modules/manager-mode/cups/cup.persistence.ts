import type {Db} from '../auction-snapshot.repository.js';
import type {Tournament} from '../manager.types.js';
import type {CupData,CupCompetition,Trophy} from './cup.types.js';
import type {Json} from '../../../types/database.generated.js';
const json=(db:Db,v:unknown)=>db.json(JSON.parse(JSON.stringify(v)) as Json);
export async function loadCups(db:Db,id:string):Promise<CupData|undefined>{
 // An older deployment without the additive tables can still load existing Manager Mode.
 const [schema]=await db`select to_regclass('public.manager_cup_competitions') as cups,to_regclass('public.manager_trophies') as trophies`;
 if(!schema?.cups||!schema.trophies)return undefined;
 const [cups,trophies]=await Promise.all([db`select state from public.manager_cup_competitions where tournament_id=${id} order by season_id`,db`select * from public.manager_trophies where tournament_id=${id} order by won_at,id`]);
 return {competitions:cups.map(r=>r.state as CupCompetition),trophies:trophies.map(r=>({id:r.id,seasonId:r.season_id,teamId:r.team_id,type:r.trophy_type as Trophy['type'],competitionId:r.competition_id,name:r.name,wonAt:r.won_at?new Date(r.won_at).getTime():null}))};
}
export async function persistCups(db:Db,t:Tournament,before:Tournament){
 if(!t.cupData||JSON.stringify(t.cupData)===JSON.stringify(before.cupData))return;
 for(const c of t.cupData.competitions){if(JSON.stringify(c)===JSON.stringify(before.cupData?.competitions.find(x=>x.id===c.id)))continue;
  await db`insert into public.manager_cup_competitions(id,tournament_id,season_id,state) values(${c.id},${t.id},${c.seasonId},${json(db,c)}) on conflict(tournament_id,season_id) do update set state=excluded.state,updated_at=now()`;
 }
 for(const trophy of t.cupData.trophies){if(before.cupData?.trophies.some(x=>x.id===trophy.id))continue;
  await db`insert into public.manager_trophies(id,tournament_id,season_id,team_id,trophy_type,competition_id,name,won_at) values(${trophy.id},${t.id},${trophy.seasonId},${trophy.teamId},${trophy.type},${trophy.competitionId},${trophy.name},${trophy.wonAt?new Date(trophy.wonAt):null}) on conflict(tournament_id,season_id,trophy_type) do nothing`;
 }
}
