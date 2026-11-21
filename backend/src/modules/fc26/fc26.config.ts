import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TOP_RATING_THRESHOLD } from '../../domain/pricing.js';
/** Source category of a CSV file. Order is the duplicate-resolution priority (Underdog is handled separately). */
export type Fc26SourceCategory = 'GK' | 'CB' | 'FB' | 'MID' | 'ATT' | 'UNDERDOG';
export const FC26_SOURCE_PRIORITY: readonly Fc26SourceCategory[] = ['GK', 'CB', 'FB', 'MID', 'ATT', 'UNDERDOG'];
export interface Fc26FileConfig { source: Fc26SourceCategory; /** Display name used in reports. */ name: string; path: string }
export interface Fc26Config { dir: string; files: Fc26FileConfig[]; topRatingThreshold: number }
export interface Fc26EnvInput {
  FC26_DATA_DIR?: string; FC26_CSV_GK?: string; FC26_CSV_CB?: string; FC26_CSV_FULLBACKS?: string;
  FC26_CSV_MID?: string; FC26_CSV_ATT?: string; FC26_CSV_UNDERDOG?: string; FC26_TOP_RATING_THRESHOLD?: number;
}
/** Repo root, valid for both src/modules/fc26 and dist/modules/fc26. */
export const defaultFc26Dir = (): string => resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const DEFAULT_NAMES: Record<Fc26SourceCategory, string[]> = {
  GK: ['FC26_GK.csv'], CB: ['FC26_CB.csv'], FB: ['FC26_Fullbacks.csv'], MID: ['FC26_Mid.csv'], ATT: ['FC26_ATT.csv'],
  UNDERDOG: ['FC26_Underdog.csv', 'FC26_Underdogs.csv'],
};
const ENV_KEYS: Record<Fc26SourceCategory, keyof Fc26EnvInput> = {
  GK: 'FC26_CSV_GK', CB: 'FC26_CSV_CB', FB: 'FC26_CSV_FULLBACKS', MID: 'FC26_CSV_MID', ATT: 'FC26_CSV_ATT', UNDERDOG: 'FC26_CSV_UNDERDOG',
};
/** Resolve paths from server configuration only. An explicit per-file override wins; otherwise the first existing default name is used. */
export function resolveFc26Config(env: Fc26EnvInput = {}, exists: (path: string) => boolean = existsSync): Fc26Config {
  const dir = resolve(env.FC26_DATA_DIR ?? defaultFc26Dir());
  const files = FC26_SOURCE_PRIORITY.map((source): Fc26FileConfig => {
    const override = env[ENV_KEYS[source]] as string | undefined;
    if (override) { const path = isAbsolute(override) ? override : resolve(dir, override); return { source, name: override, path }; }
    const names = DEFAULT_NAMES[source];
    const found = names.find(name => exists(join(dir, name))) ?? names[0]!;
    return { source, name: found, path: join(dir, found) };
  });
  return { dir, files, topRatingThreshold: env.FC26_TOP_RATING_THRESHOLD ?? DEFAULT_TOP_RATING_THRESHOLD };
}
