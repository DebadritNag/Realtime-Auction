import { api } from './api';
import type { PoolImportReportDTO, PoolImportRequestDTO } from '@/types/backend';

/** UUID v4. randomUUID exists only in secure contexts, so fall back to getRandomValues. */
export function newBatchId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const base = (roomCode: string) => `/rooms/${encodeURIComponent(roomCode)}/pool-import`;

/** Host-only HTTP calls. The backend recomputes eligibility and prices on commit; a preview is never trusted. */
export const poolImportService = {
  preview: (roomCode: string, body: PoolImportRequestDTO) => api.post<PoolImportReportDTO>(`${base(roomCode)}/preview`, body),
  /** `batchId` makes a retried commit idempotent. */
  commit: (roomCode: string, body: PoolImportRequestDTO, batchId: string = newBatchId()) =>
    api.post<PoolImportReportDTO>(`${base(roomCode)}/commit`, { ...body, batchId }),
};
