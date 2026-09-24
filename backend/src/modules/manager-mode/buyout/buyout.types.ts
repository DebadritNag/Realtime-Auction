export interface BuyoutOffer {
 id:string;fromTeamId:string;toTeamId:string;targetPlayerId:string;
 offerType:'CASH'|'CASH_PLUS_PLAYER';cashAmountUnits:number;includedPlayerId:string|null;
 status:'PENDING'|'ACCEPTED'|'REJECTED'|'COUNTERED'|'CANCELLED'|'EXPIRED';
 parentBuyoutId:string|null;respondingTeamId:string;createdBy:string;
 targetOwnershipToken:string;includedOwnershipToken:string|null;
 createdAt:number;updatedAt:number;resolvedAt:number|null;
}
export type BuyoutTerms={offerType:'CASH'|'CASH_PLUS_PLAYER';cashAmountUnits:number;includedPlayerId?:string|null};
export type BuyoutAction=({type:'BUYOUT';targetPlayerId:string}&BuyoutTerms)|({type:'BUYOUT_COUNTER';buyoutId:string}&BuyoutTerms)|{type:'BUYOUT_RESPONSE';buyoutId:string;response:'ACCEPT'|'REJECT'|'CANCEL'};
