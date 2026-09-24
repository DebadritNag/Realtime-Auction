import { requireThat } from '../../domain/errors.js';
import { z } from 'zod';
import { parseCsv } from '../players/player.service.js';
import type { ImportReport, ManagerPlayer } from './manager.types.js';
const positions = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'] as const;
export const group = (p: string) => p === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p) ? 'DEF' : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p) ? 'MID' : 'ATT';
const rowSchema = z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(100), overall: z.coerce.number().int().min(1).max(99), position: z.enum(positions) });
export function importExternalCsv(csv: string, excludedIds: string[]): ImportReport {
    const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
    const seen = new Set(excludedIds);
    const report: ImportReport = { rowsDetected: rows.length, validPlayers: 0, duplicates: 0, invalidRows: [], players: [] };
    requireThat(rows.length <= 2000, 'IMPORT_TOO_LARGE', 'External CSV may contain at most 2000 rows.');
    requireThat(!csv.trim() || rows.length > 0, 'INVALID_IMPORT', 'CSV must contain a header and at least one player row.');
    rows.forEach((r, i) => {
        const parsed = rowSchema.safeParse({ id: r.player_id || r.sofifa_id || r.ea_id, name: r.name || r.short_name, overall: r.overall, position: (r.position || r.player_positions || '').split(',')[0]?.trim().toUpperCase() });
        if (!parsed.success) {
            report.invalidRows.push({ row: i + 2, reason: parsed.error.issues.map(e => e.path.join('.') + ': ' + e.message).join('; ') });
            return;
        }
        const p = parsed.data;
        if (seen.has(p.id)) {
            report.duplicates++;
            return;
        }
        const image = r.image_url || '';
        if (image && !z.string().url().refine(v => /^https?:\/\//.test(v)).safeParse(image).success) {
            report.invalidRows.push({ row: i + 2, reason: 'Invalid image URL' });
            return;
        }
        const stats: Record<string, number> = {};
        for (const k of ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical']) {
            if (!r[k])
                continue;
            const v = Number(r[k]);
            if (!Number.isInteger(v) || v < 0 || v > 99) {
                report.invalidRows.push({ row: i + 2, reason: 'Invalid ' + k });
                return;
            }
            stats[k] = v;
        }
        const age = r.age ? Number(r.age) : undefined;
        if (age !== undefined && (!Number.isInteger(age) || age < 14 || age > 70)) {
            report.invalidRows.push({ row: i + 2, reason: 'Invalid age' });
            return;
        }
        seen.add(p.id);
        report.players.push({ ...p, category: group(p.position), secondaryPositions: (r.secondary_positions || '').slice(0, 100), club: (r.club || '').slice(0, 100), nationality: (r.nationality || r.nation || '').slice(0, 100), imageUrl: image, age, stats, tier: r.rating_tier || '', source: 'EXTERNAL_POOL', currentTeamId: null, ownershipStatus: 'FREE_AGENT', availability: 'AVAILABLE', auctionPurchasePriceUnits: null, acquisitionType: null, acquisitionPriceUnits: null, metadata: {} } satisfies ManagerPlayer);
    });
    report.validPlayers = report.players.length;
    const used=new Set(excludedIds);
    report.auditRows=rows.map((r,i)=>{const id=r.player_id||r.sofifa_id||r.ea_id||null;const invalid=report.invalidRows.find(x=>x.row===i+2);const duplicate=id!==null&&used.has(id);if(id&&!invalid)used.add(id);return {row:i+2,externalId:id,name:r.name||r.short_name||null,status:invalid?'INVALID' as const:duplicate?'DUPLICATE' as const:'VALID' as const,reason:invalid?.reason??null};});
    return report;
}
