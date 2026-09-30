/** Public wire contract from backend heroes/hero.types.ts. No private identities. */
export interface SecretSlot {
  secretSlotId: string;
  displayNumber: number;
  priceUnits: 90;
  status: 'AVAILABLE';
}
export interface SecretPlayersView {
  availableCount: number;
  priceUnits: 90;
  teamEligible: boolean;
  claimed: boolean;
  revealed: boolean;
  playerId: string | null;
  slots: SecretSlot[];
  purchaseId: string | null;
}
