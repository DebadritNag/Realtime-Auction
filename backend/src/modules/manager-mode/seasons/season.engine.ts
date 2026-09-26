import {randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament,ManagerPlayer} from '../manager.types.js';
import {standings,generateFixtures} from '../fixture.service.js';
import {ownershipToken} from '../buyout/buyout.engine.js';
import {profileFor} from '../negotiation/negotiation.engine.js';
import type {SeasonData,SeasonAction,SaleQuote} from './season.types.js';
export function ensureSeasons(t:Tournament):SeasonData{
 if(!t.seasonData){const id=randomUUID();t.seasonData={currentSeasonId:id,seasons:[{id,number:1,status:t.status==='COMPLETED'?'COMPLETED':t.status==='ARCHIVED'||t.status==='ENDED'?'ARCHIVED':'ACTIVE',championTeamId:null,startedAt:t.createdAt,completedAt:null,endedEarly:false,bonusesAwardedAt:null,finalStandings:[]}],bonuses:[],settings:{resalePercent:50,bonusUnits:t.teams.map((_,i)=>[60,48,40,32,24,20,16,12,8,4][i]??2)}};}
 // Legacy zero/missing rewards become a positive floor; awarded history stays immutable.
 t.seasonData.settings.bonusUnits=t.teams.map((_,i)=>Math.max(1,t.seasonData!.settings.bonusUnits[i]??2));
 for(const f of t.fixtures)f.seasonId??=t.seasonData.seasons[0]!.id;
 return t.seasonData;
}
export const currentSeason=(t:Tournament)=>{const d=ensureSeasons(t);return d.seasons.find(s=>s.id===d.currentSeasonId)!;};
export const seasonFixtures=(t:Tournament)=>{const id=ensureSeasons(t).currentSeasonId;return t.fixtures.filter(f=>f.seasonId===id);};
export function quoteSale(t:Tournament,p:ManagerPlayer):SaleQuote{const d=ensureSeasons(t);const basis=p.acquisitionPriceUnits&&p.acquisitionPriceUnits>0?p.acquisitionPriceUnits:(t.negotiation?.profiles.find(x=>x.playerId===p.id)??profileFor(t.id,p)).marketValueUnits;return {playerId:p.id,basisUnits:basis,saleValueUnits:Math.max(0,Math.min(basis-1,Math.floor(basis*d.settings.resalePercent/100))),ownershipToken:ownershipToken(t,p.id)};}
function notice(t:Tournament,type:string,message:string,users=t.teams.map(x=>x.managerUserId)){for(const userId of users)t.notifications.push({id:randomUUID(),userId,type,title:type.replaceAll('_',' '),message,read:false,createdAt:Date.now(),metadata:{tournamentId:t.id}});}
export function completeSeason(t:Tournament,rewards=true,now=Date.now()){
 const d=ensureSeasons(t),s=currentSeason(t);requireThat(s.status==='ACTIVE','SEASON_NOT_ACTIVE','This season is already closed.',409);
 s.finalStandings=standings(t.teams,seasonFixtures(t));s.status=rewards?'COMPLETED':'ARCHIVED';s.completedAt=now;s.endedEarly=seasonFixtures(t).some(f=>f.status!=='COMPLETED')||!seasonFixtures(t).length;
 if(rewards){s.championTeamId=s.finalStandings[0]?.teamId??null;for(const row of s.finalStandings){requireThat(!d.bonuses.some(b=>b.seasonId===s.id&&b.teamId===row.teamId),'BONUS_ALREADY_AWARDED','Season bonus already awarded.',409);const amount=d.settings.bonusUnits[row.position-1]!;const team=t.teams.find(x=>x.id===row.teamId)!;team.transferBudgetUnits+=amount;d.bonuses.push({seasonId:s.id,teamId:team.id,position:row.position,amountUnits:amount,awardedAt:now});notice(t,'SEASON_BONUS','Season '+s.number+' performance reward: ₹'+amount/2+' Cr.',[team.managerUserId]);}s.bonusesAwardedAt=now;notice(t,'LEAGUE_SHIELD_AWARDED',(t.teams.find(x=>x.id===s.championTeamId)?.name??'Champion')+' won the Season '+s.number+' League Shield.');}
 for(const trade of t.trades)if(trade.status==='PENDING'){trade.status='EXPIRED';trade.updatedAt=now;}
 t.transferWindowOpen=false;notice(t,'SEASON_COMPLETED','Season '+s.number+' has closed.');
}
export function seasonAction(t:Tournament,user:string,a:SeasonAction,now=Date.now()){
 requireThat(t.status!=='ENDED'&&t.status!=='ARCHIVED','MANAGER_MODE_ENDED','Manager Mode has ended and is read-only.',409);const d=ensureSeasons(t),s=currentSeason(t);
 if(a.type==='SELL_PLAYER'){
 requireThat(t.status==='ACTIVE'&&t.transferWindowOpen,'TRANSFER_WINDOW_CLOSED','Open the transfer window to sell a player.');const team=t.teams.find(x=>x.managerUserId===user)!;const p=t.players.find(x=>x.id===a.playerId);requireThat(p?.currentTeamId===team.id,'INVALID_OWNERSHIP','You do not own this player.',403);const quote=quoteSale(t,p);requireThat(a.ownershipToken===quote.ownershipToken&&a.expectedSaleUnits===quote.saleValueUnits,'STALE_SALE_QUOTE','Ownership or sale value changed. Review the new quote.',409);
 team.transferBudgetUnits+=quote.saleValueUnits;t.transactions.push({id:randomUUID(),playerId:p.id,fromTeamId:team.id,toTeamId:null,type:'RELEASE',amountUnits:quote.saleValueUnits,tradeId:null,at:now});p.currentTeamId=null;p.ownershipStatus='FREE_AGENT';p.availability='AVAILABLE';p.acquisitionType=null;p.acquisitionPriceUnits=null;p.metadata={...p.metadata,freeAgentReason:'TEAM_RELEASE',releasedByTeamId:team.id,releasedAt:now};
 for(const trade of t.trades)if(trade.status==='PENDING'&&[trade.offeredPlayerId,trade.requestedPlayerId].includes(p.id)){trade.status='EXPIRED';trade.updatedAt=now;}
 notice(t,'PLAYER_SOLD',p.name+' was released by '+team.name+' and is now a Free Agent.',[team.managerUserId]);return;
 }
 requireThat(t.hostUserId===user,'HOST_ONLY','Only the host can manage seasons.',403);
 if(a.type==='SEASON_SETTINGS'){requireThat(a.bonusUnits.length===t.teams.length&&a.bonusUnits.every((n,i)=>Number.isSafeInteger(n)&&n>0&&(i===0||a.bonusUnits[i-1]!>=n)),'INVALID_BONUSES','Set one positive, non-increasing bonus per league position.');d.settings={resalePercent:a.resalePercent,bonusUnits:a.bonusUnits};return;}
 if(a.type==='END_CURRENT_SEASON'){requireThat(t.status==='ACTIVE','INVALID_STATE','Generate fixtures and start the tournament first.');completeSeason(t,true,now);return;}
 if(a.type==='END_MANAGER_MODE'){if(s.status==='ACTIVE')completeSeason(t,false,now);t.status='ENDED';t.transferWindowOpen=false;notice(t,'MANAGER_MODE_ENDED','Manager Mode has ended. All history is read-only.');return;}
 requireThat(s.status==='COMPLETED','SEASON_NOT_COMPLETED','Complete the current season before starting another.');
 const next={id:randomUUID(),number:s.number+1,status:'ACTIVE' as const,championTeamId:null,startedAt:now,completedAt:null,endedEarly:false,bonusesAwardedAt:null,finalStandings:[]};
 const ids=t.teams.map(x=>x.id),offset=(next.number-1)%ids.length,rotated=[...ids.slice(offset),...ids.slice(0,offset)];const fixtures=generateFixtures(rotated,t.format==='DOUBLE_ROUND_ROBIN');
 // New IDs plus alternating venue order ensure even a two-team league gets a new schedule.
 if(next.number%2===0&&offset===0)for(const f of fixtures)[f.homeTeamId,f.awayTeamId]=[f.awayTeamId,f.homeTeamId];
 for(const f of fixtures)f.seasonId=next.id;d.seasons.push(next);d.currentSeasonId=next.id;t.fixtures.push(...fixtures);t.status='ACTIVE';t.transferWindowOpen=false;notice(t,'NEXT_SEASON_STARTED','Season '+next.number+' has started. New fixtures are available.');
}
