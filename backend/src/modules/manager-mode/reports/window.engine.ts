import {randomUUID} from 'node:crypto';
import type {Tournament} from '../manager.types.js';
import {requireThat} from '../../../domain/errors.js';
export function setTransferWindow(t:Tournament,open:boolean,now=Date.now()){
 const windows=t.transferWindows??=[];const active=windows.find(w=>w.status==='OPEN');
 if(open){if(active){t.transferWindowOpen=true;return;}const season=t.seasonData?.seasons.find(s=>s.id===t.seasonData?.currentSeasonId);
 windows.push({id:randomUUID(),number:Math.max(0,...windows.map(w=>w.number))+1,seasonId:season?.id??null,seasonNumber:season?.number??null,status:'OPEN',openedAt:now,closedAt:null,auditAvailable:true,teams:t.teams.map(team=>({teamId:team.id,teamName:team.name,managerName:team.managerUsername??'Manager',openingBudgetUnits:team.transferBudgetUnits,closingBudgetUnits:null}))});
 }else if(active){active.status='CLOSED';active.closedAt=now;for(const snapshot of active.teams)snapshot.closingBudgetUnits=t.teams.find(team=>team.id===snapshot.teamId)!.transferBudgetUnits;}
 t.transferWindowOpen=open;
}
export function tagWindowTransactions(t:Tournament,oldIds:Set<string>){
 const added=t.transactions.filter(row=>!oldIds.has(row.id)&&row.type!=='AUCTION_PURCHASE');if(!added.length)return;
 const active=t.transferWindows?.find(w=>w.status==='OPEN');requireThat(active,'TRANSFER_WINDOW_CLOSED','Transfer records require an active window.',409);
 for(const row of added)row.transferWindowId=active.id;
}
