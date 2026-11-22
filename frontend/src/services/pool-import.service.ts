import { api } from './api';
import type { PoolImportReportDTO, PoolImportRequestDTO } from '@/types/backend';

const base = (roomCode: string) => `/rooms/${encodeURIComponent(roomCode)}/pool-import`;

/** Host-only HTTP calls. The backend recomputes eligibility and prices on commit; a preview is never trusted. */
export const poolImportService = {
  preview: (roomCode: string, body: PoolImportRequestDTO) => api.post<PoolImportReportDTO>(`${base(roomCode)}/preview`, body),
  /** `batchId` makes a retried commit idempotent. */
  commit: (roomCode: string, body: PoolImportRequestDTO, batchId: string = crypto.randomUUID()) =>
    api.post<PoolImportReportDTO>(`${base(roomCode)}/commit`, { ...body, batchId }),
};
