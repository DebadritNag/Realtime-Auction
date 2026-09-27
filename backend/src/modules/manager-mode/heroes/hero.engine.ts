import {randomInt,randomUUID} from 'node:crypto';
import {requireThat} from '../../../domain/errors.js';
import type {Tournament,ManagerPlayer} from '../manager.types.js';
import {heroCatalog} from './hero.catalog.js';
import type {SecretPlayersView} from './hero.types.js';
export const isHero=(p:ManagerPlayer)=>p.source==='SECRET_HERO';
export function assertTransferable(p:ManagerPlayer){requireThat(!isHero(p),'HERO_UNTRADEABLE','Hero players cannot be sold, released or transferred.',409);}
export function heroView(t:Tournament,teamId:string):SecretPlayersView{
 const claim=t.secretHeroes?.find(p=>p.teamId===teamId);
 return {availableCount:t.secretHeroes?.filter(p=>!p.teamId).length??heroCatalog.length,priceUnits:90,teamEligible:!claim,claimed:!!claim,revealed:!!claim?.revealedAt,playerId:claim?.revealedAt?claim.playerId:null};
}
export function visiblePlayers(t:Tournament){return t.players.filter(p=>!isHero(p)||t.secretHeroes?.some(h=>h.playerId===p.id&&h.revealedAt!==null));}
/** Runs inside the existing tournament transaction, before any result is broadcast. */
export function heroAction(t:Tournament,user:string,type:'BUY_SECRET_PLAYER'|'REVEAL_SECRET_PLAYER',now=Date.now()){
 const team=t.teams.find(t=>t.managerUserId===user);
 requireThat(team?.invitation==='JOINED','NOT_TOURNAMENT_MEMBER','Joined membership required.',403);
 if(type==='REVEAL_SECRET_PLAYER'){
  const claim=t.secretHeroes?.find(h=>h.teamId===team.id);
  requireThat(claim,'HERO_NOT_CLAIMED','Purchase a Secret Player first.',409);
  claim.revealedAt??=now;return;
 }
 requireThat(t.status==='ACTIVE'&&t.transferWindowOpen,'TRANSFER_WINDOW_CLOSED','An active Manager Mode and open transfer window are required.',409);
 requireThat(!t.secretHeroes?.some(h=>h.teamId===team.id),'HERO_ALREADY_CLAIMED','Your team has already used its lifetime Hero entitlement.',409);
 requireThat(team.transferBudgetUnits>=90,'INSUFFICIENT_BUDGET','A Secret Player costs ₹45 Cr.',409);
 const window=t.transferWindows?.find(w=>w.status==='OPEN');
 requireThat(window,'TRANSFER_WINDOW_CLOSED','An open transfer window is required.',409);
 t.secretHeroes??=heroCatalog.map(identity=>({id:randomUUID(),identity:{...identity},teamId:null,playerId:null,claimedAt:null,revealedAt:null,transferWindowId:null}));
 const available=t.secretHeroes.filter(h=>!h.teamId);
 requireThat(available.length,'HERO_POOL_EMPTY','All Secret Players have been claimed.',409);
 const hero=available[randomInt(available.length)]!;
 const player:ManagerPlayer={id:randomUUID(),name:hero.identity.name,position:hero.identity.position,overall:null,stats:{},secondaryPositions:'',category:hero.identity.position,club:'',nationality:'',imageUrl:'',tier:'',source:'SECRET_HERO',currentTeamId:team.id,ownershipStatus:'OWNED',availability:'SIGNED',auctionPurchasePriceUnits:null,acquisitionType:'SECRET_HERO_PURCHASE',acquisitionPriceUnits:90,metadata:{},isSecretHero:true,isTradeable:false,isSellable:false};
 team.transferBudgetUnits-=90;
 Object.assign(hero,{teamId:team.id,playerId:player.id,claimedAt:now,transferWindowId:window.id});
 t.players.push(player);
 t.transactions.push({id:randomUUID(),playerId:player.id,fromTeamId:null,toTeamId:team.id,type:'SECRET_HERO_PURCHASE',amountUnits:90,tradeId:null,at:now,transferWindowId:window.id});
}
