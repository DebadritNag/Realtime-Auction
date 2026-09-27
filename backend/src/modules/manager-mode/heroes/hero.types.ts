export interface HeroIdentity { name:string; position:string }
/** Private repository data. Never include in a client response. */
export interface SecretHero {
 id:string; identity:HeroIdentity; teamId:string|null; playerId:string|null;
 claimedAt:number|null; revealedAt:number|null; transferWindowId:string|null;
}
export interface SecretPlayersView {
 availableCount:number; priceUnits:90; teamEligible:boolean;
 claimed:boolean; revealed:boolean; playerId:string|null;
}
