import {randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament} from '../manager.types.js';
import type {BuyoutAction,BuyoutOffer,BuyoutTerms} from './buyout.types.js';
export const ownershipToken=(t:Tournament,id:string)=>t.transactions.filter(x=>x.playerId===id).at(-1)?.id??'initial';
export function validOwnership(t:Tournament,o:BuyoutOffer){return t.players.some(p=>p.id===o.targetPlayerId&&p.currentTeamId===o.toTeamId)&&ownershipToken(t,o.targetPlayerId)===o.targetOwnershipToken&&(!o.includedPlayerId||t.players.some(p=>p.id===o.includedPlayerId&&p.currentTeamId===o.fromTeamId)&&ownershipToken(t,o.includedPlayerId)===o.includedOwnershipToken);}
export function synchronizeBuyouts(t:Tournament,now=Date.now()){
 for(const o of t.buyouts??[])if(o.status==='PENDING'&&(!t.transferWindowOpen||t.status!=='ACTIVE'||!validOwnership(t,o))){o.status='EXPIRED';o.updatedAt=now;o.resolvedAt=now;}
}
function terms(t:Tournament,buyer:string,seller:string,target:string,a:BuyoutTerms){
 requireThat(buyer!==seller,'INVALID_RECIPIENT','Choose another team.');
 requireThat(t.teams.some(x=>x.id===seller&&x.invitation==='JOINED'),'INVALID_RECIPIENT','The selling manager must have joined.');
 requireThat(t.players.some(p=>p.id===target&&p.currentTeamId===seller),'STALE_OWNERSHIP','Target player ownership changed.',409);
 requireThat(Number.isSafeInteger(a.cashAmountUnits)&&a.cashAmountUnits>=0,'INVALID_BUYOUT','Use nonnegative integer half-crore units.');
 requireThat(a.offerType==='CASH'?a.cashAmountUnits>0&&!a.includedPlayerId:Boolean(a.includedPlayerId),'INVALID_BUYOUT','Cash offers need positive cash only; cash plus player offers need a player.');
 requireThat(!a.includedPlayerId||a.includedPlayerId!==target&&t.players.some(p=>p.id===a.includedPlayerId&&p.currentTeamId===buyer),'INVALID_OWNERSHIP','Included player must belong to the buying team.');
 requireThat((t.teams.find(x=>x.id===buyer)?.transferBudgetUnits??-1)>=a.cashAmountUnits,'INSUFFICIENT_BUDGET','The buying team cannot afford this offer.',409);
}
/** Executed only inside the repository's serialized tournament transaction. */
export function buyoutAction(t:Tournament,user:string,a:BuyoutAction,now=Date.now()):BuyoutOffer{
 const team=t.teams.find(x=>x.managerUserId===user);requireThat(team?.invitation==='JOINED','NOT_TOURNAMENT_MEMBER','Joined membership required.',403);const offers=t.buyouts??=[];
 if(a.type==='BUYOUT'||a.type==='BUYOUT_COUNTER'){
 requireThat(t.status==='ACTIVE'&&t.transferWindowOpen,'TRANSFER_WINDOW_CLOSED','The transfer window is closed.');
 let parent:BuyoutOffer|undefined;
 if(a.type==='BUYOUT_COUNTER'){parent=offers.find(x=>x.id===a.buyoutId);requireThat(parent?.status==='PENDING','BUYOUT_NOT_PENDING','Offer is no longer pending.',409);requireThat(parent.respondingTeamId===team.id,'BUYOUT_PERMISSION','Only the responding manager can counter.',403);requireThat(validOwnership(t,parent),'STALE_OWNERSHIP','Player ownership changed.',409);}
 const target=a.type==='BUYOUT'?a.targetPlayerId:parent!.targetPlayerId;
 const buyer=parent?.fromTeamId??team.id,seller=parent?.toTeamId??t.players.find(p=>p.id===target)?.currentTeamId;
 requireThat(seller,'PLAYER_NOT_OWNED','Select a player owned by another team.');terms(t,buyer,seller,target,a);
 requireThat(!offers.some(o=>o.status==='PENDING'&&o.id!==parent?.id&&o.fromTeamId===buyer&&o.toTeamId===seller&&o.targetPlayerId===target),'DUPLICATE_BUYOUT','A pending offer already exists for this player.',409);
 if(parent){parent.status='COUNTERED';parent.updatedAt=now;parent.resolvedAt=now;}
 const offer:BuyoutOffer={id:randomUUID(),fromTeamId:buyer,toTeamId:seller,targetPlayerId:target,offerType:a.offerType,cashAmountUnits:a.cashAmountUnits,includedPlayerId:a.includedPlayerId??null,status:'PENDING',parentBuyoutId:parent?.id??null,respondingTeamId:team.id===buyer?seller:buyer,createdBy:user,targetOwnershipToken:ownershipToken(t,target),includedOwnershipToken:a.includedPlayerId?ownershipToken(t,a.includedPlayerId):null,createdAt:now,updatedAt:now,resolvedAt:null};offers.push(offer);return offer;
 }
 const offer=offers.find(o=>o.id===a.buyoutId);requireThat(offer?.status==='PENDING','BUYOUT_NOT_PENDING','Offer is no longer pending.',409);
 requireThat(a.response==='CANCEL'?offer.createdBy===user:offer.respondingTeamId===team.id,'BUYOUT_PERMISSION','You cannot respond to this offer.',403);
 if(a.response==='ACCEPT'){
 requireThat(t.status==='ACTIVE'&&t.transferWindowOpen,'TRANSFER_WINDOW_CLOSED','The transfer window is closed.');requireThat(validOwnership(t,offer),'STALE_OWNERSHIP','Player ownership changed.',409);
 terms(t,offer.fromTeamId,offer.toTeamId,offer.targetPlayerId,offer);
 const buyer=t.teams.find(x=>x.id===offer.fromTeamId)!,seller=t.teams.find(x=>x.id===offer.toTeamId)!;
 requireThat(Number.isSafeInteger(seller.transferBudgetUnits+offer.cashAmountUnits),'INVALID_BUDGET','Resulting budget exceeds supported precision.');
 buyer.transferBudgetUnits-=offer.cashAmountUnits;seller.transferBudgetUnits+=offer.cashAmountUnits;
 for(const [id,target,amount] of [[offer.targetPlayerId,buyer.id,offer.cashAmountUnits],...(offer.includedPlayerId?[[offer.includedPlayerId,seller.id,0] as const]:[])] as readonly (readonly [string,string,number])[]){const p=t.players.find(p=>p.id===id)!;t.transactions.push({id:randomUUID(),playerId:id,fromTeamId:p.currentTeamId,toTeamId:target,type:'BUYOUT',amountUnits:amount,tradeId:null,buyoutId:offer.id,at:now});p.currentTeamId=target;p.acquisitionType='BUYOUT';p.acquisitionPriceUnits=amount;}
 for(const trade of t.trades)if(trade.status==='PENDING'&&[trade.offeredPlayerId,trade.requestedPlayerId].some(id=>id===offer.targetPlayerId||id===offer.includedPlayerId)){trade.status='EXPIRED';trade.updatedAt=now;}
 }
 offer.status=a.response==='ACCEPT'?'ACCEPTED':a.response==='REJECT'?'REJECTED':'CANCELLED';offer.updatedAt=now;offer.resolvedAt=now;return offer;
}
