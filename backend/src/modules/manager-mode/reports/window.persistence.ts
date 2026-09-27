import type {Db} from '../auction-snapshot.repository.js';
import type {Tournament} from '../manager.types.js';
import type {TransferWindow} from './window.types.js';
export async function loadTransferWindows(db:Db,id:string):Promise<TransferWindow[]>{
 const [windows,snapshots]=await Promise.all([db`select w.*,s.season_number from public.manager_transfer_windows w left join public.manager_seasons s on s.id=w.season_id where w.tournament_id=${id} order by w.window_number`,db`select * from public.manager_transfer_window_team_snapshots where tournament_id=${id}`]);
 return windows.map(w=>({id:w.id,number:w.window_number,seasonId:w.season_id,seasonNumber:w.season_number??null,status:w.status,openedAt:new Date(w.opened_at).getTime(),closedAt:w.closed_at?new Date(w.closed_at).getTime():null,auditAvailable:w.audit_available,teams:snapshots.filter(s=>s.transfer_window_id===w.id).map(s=>({teamId:s.team_id,teamName:s.team_name,managerName:s.manager_name,openingBudgetUnits:Number(s.opening_budget_units),closingBudgetUnits:s.closing_budget_units===null?null:Number(s.closing_budget_units)}))}));
}
export async function persistTransferWindows(db:Db,t:Tournament,before:Tournament,actor:string){
 for(const w of t.transferWindows??[]){const old=before.transferWindows?.find(x=>x.id===w.id);
 if(!old){await db`insert into public.manager_transfer_windows(id,tournament_id,opened_by,opened_at,status,window_number,season_id,audit_available) values(${w.id},${t.id},${actor},${new Date(w.openedAt)},'OPEN',${w.number},${w.seasonId},${w.auditAvailable})`;}
 if(old?.status==='OPEN'&&w.status==='CLOSED'){for(const s of w.teams)await db`update public.manager_transfer_window_team_snapshots set closing_budget_units=${s.closingBudgetUnits} where transfer_window_id=${w.id} and team_id=${s.teamId} and closing_budget_units is null`;await db`update public.manager_transfer_windows set status='CLOSED',closed_at=${new Date(w.closedAt!)},closed_by=${actor} where id=${w.id} and status='OPEN'`;}
 }
}
