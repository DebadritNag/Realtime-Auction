import { requireThat } from './errors.js';
/** One integer unit is half a crore. All persisted money is in units. */
export function toUnits(cr: number): number {
  requireThat(Number.isFinite(cr) && cr >= 0 && Number.isSafeInteger(cr * 2) && cr <= 1_000_000,
    'INVALID_INCREMENT', 'Money must be nonnegative, at most 1,000,000 Cr, in 0.5 Cr units.');
  return cr * 2;
}
export const toCr = (units: number): number => units / 2;
export const getBidIncrement = (units: number): number => units < 20 ? 1 : units < 40 ? 2 : 4;
export const getMinimumNextBid = (units: number): number => units + getBidIncrement(units);
