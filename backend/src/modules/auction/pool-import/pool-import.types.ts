import type { Player, PoolImportRowResult } from '../../../domain/types.js';
import type { CategoryState } from './pool-additions.js';

export type PoolImportSource = 'CSV' | 'FC26_DATABASE' | 'DEFAULT_POOL';
export interface PoolImportInput {
  source: PoolImportSource; fileName?: string | undefined; csv?: string | undefined; playerIds?: string[] | undefined;
  potIds?: string[] | undefined; search?: string | undefined; batchId?: string | undefined;
}
/** One parsed input record. `player` is absent for rows that failed validation. Prices are already server-computed. */
export interface PoolCandidate { row: number; playerId: string; name: string; player?: Player; error?: PoolImportRowResult }
export interface ParsedPoolInput { sourceKind: PoolImportSource; sourceFile: string; candidates: PoolCandidate[]; contentHash: string }
export type PoolRowStatus = 'ELIGIBLE' | 'SKIPPED' | 'REJECTED';
export interface PoolReportRow {
  row: number; playerId: string; name: string; positions?: string[]; ovr?: number; potId?: string; categoryState?: CategoryState;
  basePriceCr?: number; underdog?: boolean; status: PoolRowStatus; code: string; reason: string;
}
export interface PoolImportReport {
  mode: 'PREVIEW' | 'COMMIT'; batchId?: string; duplicate?: boolean; sequence: number;
  totals: { totalRecords: number; eligible: number; added: number; skipped: number; rejected: number; byReason: Record<string, number> };
  rows: PoolReportRow[];
}
export const POOL_IMPORT_LIMITS = { maxCsvChars: 1_500_000, maxRows: 1000, maxFileName: 120, maxStoredResults: 500, maxBatches: 100 } as const;
