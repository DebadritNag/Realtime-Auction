import {randomInt,randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament,ManagerPlayer} from '../manager.types.js';
import {heroCatalog} from './hero.catalog.js';
import type {SecretPlayersView} from './hero.types.js';
export const isHero=(p:ManagerPlayer)=>p.source==='SECRET_HERO';
export function assertTransferable(p:ManagerPlayer){requireThat(!isHero(p),'HERO_UNTRADEABLE','Hero players cannot be sold, released or transferred.',409);}
export function ensureHeroPool(t:Tournament){
 if(t.secretHeroes?.length)return;
 const identities=[...heroCatalog];
 for(let i=identities.length-1;i>0;i--){const j=randomInt(i+1);[identities[i],identities[j]]=[identities[j]!,identities[i]!];}
 t.secretHeroes=identities.map(identity=>({id:randomUUID(),identity:{...identity},teamId:null,playerId:null,claimedAt:null,revealedAt:null,transferWindowId:null}));
}
export function heroView(t:Tournament,teamId:string):SecretPlayersView{
 const claim=t.secretHeroes?.find(p=>p.teamId===teamId);
 return {slots:(t.secretHeroes??[]).map((h,i)=>({secretSlotId:h.id,displayNumber:i+1,priceUnits:90 as const,status:'AVAILABLE' as const,available:!h.teamId})).filter(h=>h.available).map(({available,...slot})=>slot),purchaseId:claim?.id??null,availableCount:t.secretHeroes?.filter(p=>!p.teamId).length??heroCatalog.length,priceUnits:90,teamEligible:!claim,claimed:!!claim,revealed:!!claim?.revealedAt,playerId:claim?.revealedAt?claim.playerId:null};
}
export function visiblePlayers(t:Tournament,teamId?:string){return t.players.filter(p=>!isHero(p)||t.secretHeroes?.some(h=>h.playerId===p.id&&(h.revealedAt!==null||h.teamId===teamId)));}
/** Runs inside the existing tournament transaction, before any result is broadcast. */
export function heroAction(t:Tournament,user:string,type:'BUY_SECRET_PLAYER'|'REVEAL_SECRET_PLAYER',secretSlotId?:string,now=Date.now(),trace:(stage:string)=>void=()=>{}){
 const team=t.teams.find(t=>t.managerUserId===user);
 requireThat(team?.invitation==='JOINED','NOT_TOURNAMENT_MEMBER','Joined membership required.',403);
 if(type==='REVEAL_SECRET_PLAYER'){
  const claim=t.secretHeroes?.find(h=>h.teamId===team.id);
  requireThat(claim,'HERO_NOT_CLAIMED','Purchase a Secret Player first.',409);
  claim.revealedAt??=now;return;
 }
 requireThat(t.status==='ACTIVE'&&t.transferWindowOpen,'TRANSFER_WINDOW_CLOSED','An active Manager Mode and open transfer window are required.',409);
 requireThat(!t.secretHeroes?.some(h=>h.teamId===team.id),'SECRET_PLAYER_ALREADY_USED','Your team has already used its lifetime Hero entitlement.',409);
 trace('eligibility validated');
 requireThat(team.transferBudgetUnits>=90,'INSUFFICIENT_BUDGET','A Secret Player costs ₹45 Cr.',409);
 trace('budget validated');
 const window=t.transferWindows?.find(w=>w.status==='OPEN');
 requireThat(window,'TRANSFER_WINDOW_CLOSED','An open transfer window is required.',409);
 trace('active transfer window resolved');trace('secret pool loaded');
 const hero=t.secretHeroes?.find(h=>h.id===secretSlotId);
 requireThat(hero,'SECRET_PLAYER_NOT_FOUND','This Secret Player slot was not found.',404);
 trace('slot resolved');
 requireThat(!hero.teamId,'SECRET_PLAYER_ALREADY_CLAIMED','This Secret Player was just claimed by another team.',409);
 const player:ManagerPlayer={id:randomUUID(),name:hero.identity.name,position:hero.identity.position,overall:null,stats:{},secondaryPositions:'',category:hero.identity.position,club:'',nationality:'',imageUrl:'',tier:'',source:'SECRET_HERO',currentTeamId:team.id,ownershipStatus:'OWNED',availability:'SIGNED',auctionPurchasePriceUnits:null,acquisitionType:'SECRET_HERO_PURCHASE',acquisitionPriceUnits:90,metadata:{},isSecretHero:true,isTradeable:false,isSellable:false};
 team.transferBudgetUnits-=90;
 Object.assign(hero,{teamId:team.id,playerId:player.id,claimedAt:now,transferWindowId:window.id});
 t.players.push(player);
 t.transactions.push({id:randomUUID(),playerId:player.id,fromTeamId:null,toTeamId:team.id,type:'SECRET_HERO_PURCHASE',amountUnits:90,tradeId:null,at:now,transferWindowId:window.id});
}
