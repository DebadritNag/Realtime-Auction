export interface HeroIdentity { name:string; position:string }
/** Private repository data. Never include in a client response. */
export interface SecretHero {
 id:string; identity:HeroIdentity; teamId:string|null; playerId:string|null;
 claimedAt:number|null; revealedAt:number|null; transferWindowId:string|null;
}
/** One anonymous slot exposed to the client — identity fields are absent. */
export interface SecretSlot {
 secretSlotId:string;       // safe opaque identifier for targeting a specific slot
 displayNumber:number;      // 1-based for UI display ("SECRET PLAYER #7")
 priceUnits:90;
 status:'AVAILABLE';
}
export interface SecretPlayersView {
 availableCount: number;
 priceUnits: 90;
 teamEligible: boolean;
 claimed: boolean;
 revealed: boolean;
 /** playerId of the claimed Hero — only present after the team reveals. */
 playerId: string | null;
 /** Randomized anonymous slots — only available/claimed status, no identity. */
 slots: SecretSlot[];
 purchaseId:string|null;
}
