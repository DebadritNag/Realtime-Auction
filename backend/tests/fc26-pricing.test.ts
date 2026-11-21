import { describe, expect, it } from 'vitest';
import { fc26BasePriceUnits, DEFAULT_TOP_RATING_THRESHOLD } from '../src/domain/pricing.js';
import { settingsSchema, parseSettings } from '../src/schemas/settings.js';
import { readEnvironment } from '../src/config/env.js';

describe('FC26 base pricing', () => {
  it('prices Underdogs at 1 Cr regardless of rating', () => {
    expect(fc26BasePriceUnits({ overall: 80, draftPool: 'UNDERDOG' })).toBe(2);
    expect(fc26BasePriceUnits({ overall: 95, draftPool: 'UNDERDOG' })).toBe(2);
  });
  it('prices regular players 3 Cr below the threshold and 5 Cr at or above it', () => {
    expect(DEFAULT_TOP_RATING_THRESHOLD).toBe(90);
    expect(fc26BasePriceUnits({ overall: 89, draftPool: 'REGULAR' })).toBe(6);
    expect(fc26BasePriceUnits({ overall: 90, draftPool: 'REGULAR' })).toBe(10);
    expect(fc26BasePriceUnits({ overall: 91, draftPool: 'REGULAR' })).toBe(10);
  });
  it('honours a threshold override', () => {
    expect(fc26BasePriceUnits({ overall: 90, draftPool: 'REGULAR' }, 92)).toBe(6);
    expect(fc26BasePriceUnits({ overall: 88, draftPool: 'REGULAR' }, 85)).toBe(10);
  });
  it('reads the threshold from the environment with a bounded default', () => {
    expect(readEnvironment({ AUTH_MODE: 'development' } as NodeJS.ProcessEnv).FC26_TOP_RATING_THRESHOLD).toBe(90);
    expect(readEnvironment({ AUTH_MODE: 'development', FC26_TOP_RATING_THRESHOLD: '88' } as NodeJS.ProcessEnv).FC26_TOP_RATING_THRESHOLD).toBe(88);
    expect(() => readEnvironment({ AUTH_MODE: 'development', FC26_TOP_RATING_THRESHOLD: '5' } as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('FC26 settings', () => {
  it('parses old settings without the new keys', () => {
    const settings = settingsSchema.parse({ numberOfTeams: 4, startingBudgetCr: 100 });
    expect(settings.playerPoolSource).toBe('DEFAULT');
    expect(settings.retention).toEqual({ enabled: false });
  });
  it('requires the FC26 source for retention and rejects editable retention fields', () => {
    expect(() => settingsSchema.parse({ retention: { enabled: true } })).toThrow();
    expect(settingsSchema.parse({ playerPoolSource: 'FC26', retention: { enabled: true } }).retention.enabled).toBe(true);
    expect(() => settingsSchema.parse({ playerPoolSource: 'FC26', retention: { enabled: true, priceCr: 1 } })).toThrow();
  });
  it('forces the minimum base price to 1 Cr for FC26 only', () => {
    expect(parseSettings({ playerPoolSource: 'FC26', minimumBasePriceCr: 5 }).minimumBasePriceCr).toBe(1);
    expect(parseSettings({ minimumBasePriceCr: 5 }).minimumBasePriceCr).toBe(5);
  });
});
