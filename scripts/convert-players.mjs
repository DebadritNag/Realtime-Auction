/**
 * convert-players.mjs
 *
 * Converts male_players.csv (FIFA / EA FC format) into the backend's
 * default-player-pool.csv format using proper RFC-4180 CSV parsing.
 *
 * Usage:
 *   node scripts/convert-players.mjs
 *
 * Output:
 *   backend/data/default-pool/default-player-pool.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dirname, '..');
const INPUT  = join(ROOT, 'frontend', 'male_players.csv');
const OUTPUT = join(ROOT, 'backend', 'data', 'default-pool', 'default-player-pool.csv');

// ── RFC-4180 CSV parser (handles quoted fields with embedded commas) ───────────
function parseCsvRfc4180(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const nx = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') {
        row.push(field.trim());
        if (row.length > 1 || row[0]) rows.push(row);
        row = []; field = '';
      } else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.length > 1 || row[0]) rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

// ── Position mapping ──────────────────────────────────────────────────────────
const POS_GROUP = {
  GK:  'GK',
  CB:  'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW:  'ATT', RW: 'ATT', ST: 'ATT', CF: 'ATT', LF: 'ATT', RF: 'ATT',
};

function group(positions) {
  const first = (positions || '').split(',')[0].trim().toUpperCase();
  return POS_GROUP[first] ?? 'MID';
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function basePriceCr(ovr) {
  if (ovr >= 92) return 20;
  if (ovr >= 90) return 15;
  if (ovr >= 88) return 10;
  if (ovr >= 86) return 7;
  if (ovr >= 84) return 5;
  if (ovr >= 82) return 4;
  if (ovr >= 80) return 3;
  if (ovr >= 78) return 2;
  return 1;
}

function tier(ovr) {
  if (ovr >= 90) return 'ELITE';
  if (ovr >= 85) return 'GOLD';
  if (ovr >= 80) return 'SILVER';
  return 'BRONZE';
}

function n(v) { const x = parseInt(v, 10); return isNaN(x) ? 0 : Math.min(99, Math.max(0, x)); }
function safe(v) { return String(v ?? '').replace(/,/g, ' ').replace(/"/g, "'").trim(); }

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Reading and parsing CSV (this takes ~10s for 180k rows)…');
const raw = readFileSync(INPUT, 'utf8');
const records = parseCsvRfc4180(raw);
console.log(`Parsed ${records.length} rows`);

// Deduplicate: keep highest fifa_version per player_id
const best = new Map();
for (const r of records) {
  const id  = r.player_id;
  const ver = parseFloat(r.fifa_version || '0');
  const ovr = parseInt(r.overall, 10) || 0;
  if (!id || ovr < 78) continue;
  const ex = best.get(id);
  if (!ex || ver > ex.ver || (ver === ex.ver && ovr > ex.ovr)) {
    best.set(id, { r, ver, ovr });
  }
}
console.log(`Unique players (OVR ≥ 78): ${best.size}`);

// Build structured player objects
const all = [];
for (const { r, ovr } of best.values()) {
  const posRaw   = r.player_positions || r.position || '';
  const parts    = posRaw.split(',').map(p => p.trim()).filter(Boolean);
  const primary  = parts[0] || 'ST';
  const secondary = parts.slice(1).join('|');
  const grp      = group(posRaw);

  // GKs: use goalkeeping stats for the 6-stat display (pac/sho/pas/dri/def/phy)
  // outfield: pace/shooting/passing/dribbling/defending/physic
  let pac, sho, pas, dri, def, phy;
  if (grp === 'GK') {
    pac = n(r.goalkeeping_speed   || r.pace     || '50');
    sho = n(r.goalkeeping_kicking || r.shooting  || '50');
    pas = n(r.goalkeeping_reflexes|| r.passing   || '50');
    dri = n(r.goalkeeping_handling|| r.dribbling || '50');
    def = n(r.goalkeeping_positioning || r.defending || '50');
    phy = n(r.goalkeeping_diving  || r.physic    || '50');
  } else {
    pac = n(r.pace);
    sho = n(r.shooting);
    pas = n(r.passing);
    dri = n(r.dribbling);
    def = n(r.defending);
    phy = n(r.physic);
  }

  all.push({
    player_id:           r.player_id,
    name:                safe(r.short_name),
    overall:             ovr,
    position:            primary,
    secondary_positions: secondary,
    age:                 r.age || '',
    nationality:         safe(r.nationality_name),
    club:                safe(r.club_name),
    league:              safe(r.league_name),
    preferred_foot:      r.preferred_foot || '',
    pace:                pac,
    shooting:            sho,
    passing:             pas,
    dribbling:           dri,
    defending:           def,
    physical:            phy,
    image_url:           '',
    auction_group:       grp,
    rating_tier:         tier(ovr),
    base_price_cr:       basePriceCr(ovr),
    _ovr:                ovr,
    _grp:                grp,
  });
}

// Sort by OVR desc within each group
all.sort((a, b) => b._ovr - a._ovr);

// ── Select balanced pool ──────────────────────────────────────────────────────
// Max 2000 total (backend hard cap). Target balanced pool of ~760.
const TARGETS = { GK: 60, DEF: 200, MID: 250, ATT: 250 };
const buckets  = { GK: [], DEF: [], MID: [], ATT: [] };

for (const p of all) {
  const g = p._grp;
  if (buckets[g] && buckets[g].length < TARGETS[g]) buckets[g].push(p);
}

const selected = [
  ...buckets.GK,
  ...buckets.DEF,
  ...buckets.MID,
  ...buckets.ATT,
];

// Sort final output: group order then OVR desc
const gOrder = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
selected.sort((a, b) => gOrder[a._grp] - gOrder[b._grp] || b._ovr - a._ovr);

console.log(`\nFinal pool: ${selected.length} players`);
console.log(`  GK: ${buckets.GK.length}  DEF: ${buckets.DEF.length}  MID: ${buckets.MID.length}  ATT: ${buckets.ATT.length}`);

// ── Write CSV ─────────────────────────────────────────────────────────────────
const COLS = [
  'player_id','name','overall','position','secondary_positions',
  'age','nationality','club','league','preferred_foot',
  'pace','shooting','passing','dribbling','defending','physical',
  'image_url','auction_group','rating_tier','base_price_cr',
];

const outLines = [COLS.join(',')];
for (const p of selected) {
  outLines.push(COLS.map(c => p[c] ?? '').join(','));
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, outLines.join('\n'), 'utf8');

// Quick sanity check on first GK
const firstGk = selected.find(p => p._grp === 'GK');
if (firstGk) {
  console.log(`\nSample GK — ${firstGk.name} (OVR ${firstGk.overall}):  pac=${firstGk.pace} sho=${firstGk.shooting} pas=${firstGk.passing} dri=${firstGk.dribbling} def=${firstGk.defending} phy=${firstGk.physical}`);
}
const firstAtt = selected.find(p => p._grp === 'ATT');
if (firstAtt) {
  console.log(`Sample ATT — ${firstAtt.name} (OVR ${firstAtt.overall}):  pac=${firstAtt.pace} sho=${firstAtt.shooting} pas=${firstAtt.passing} dri=${firstAtt.dribbling} def=${firstAtt.defending} phy=${firstAtt.physical}`);
}

console.log(`\nWritten → ${OUTPUT}`);
