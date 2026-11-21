import { toUnits } from './money.js';
/** Fixed retention rules. Teams cannot change them; settings only expose the on/off switch. */
export const RETENTION_PRICE_CR = 15;
export const RETENTION_PRICE_UNITS = toUnits(RETENTION_PRICE_CR);
export const RETENTION_MAX_PER_TEAM = 3;
export const RETENTION_MIN_PER_TEAM = 0;
