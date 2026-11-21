import type { Fc26ImportReportDTO, Fc26StatusDTO } from '@/types/backend';
import { api } from './api';

/** FC26 catalog status and import. Paths are configured on the server; the client never sends any. */
export const fc26Service = {
  status: () => api.get<Fc26StatusDTO>('/fc26/status'),
  importAll: () => api.post<Fc26ImportReportDTO>('/fc26/import', {}),
};
