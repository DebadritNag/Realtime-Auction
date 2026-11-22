import { toUnits } from './money.js';
/** Single source of truth for FC26 base prices. No rating conditions may live anywhere else. */
export const UNDERDOG_BASE_PRICE_CR = 1;
export const MEDIUM_BASE_PRICE_CR = 3;
export const TOP_BASE_PRICE_CR = 5;
export const DEFAULT_TOP_RATING_THRESHOLD = 90;
export type DraftPool = 'REGULAR' | 'UNDERDOG';
/** Default (non-FC26) pool tier ladder in Cr, by overall rating. */
export const defaultPoolBasePriceCr = (ovr: number): number => ovr >= 90 ? 9 : ovr >= 87 ? 7 : ovr >= 84 ? 5 : ovr >= 81 ? 2 : 1;
export function fc26BasePriceUnits(player: { overall: number; draftPool: DraftPool },
  threshold: number = DEFAULT_TOP_RATING_THRESHOLD): number {
  if (player.draftPool === 'UNDERDOG') return toUnits(UNDERDOG_BASE_PRICE_CR);
  return toUnits(player.overall >= threshold ? TOP_BASE_PRICE_CR : MEDIUM_BASE_PRICE_CR);
}
