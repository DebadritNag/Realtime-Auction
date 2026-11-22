// Fails if any FC26 CSV player (incl. the reported ones) would resolve to the default silhouette.
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { loadFc26 } from '../scripts/fc26-csv.mjs';
const dir = new URL('../public/images/players/', import.meta.url);
const hash = f => createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex');
const def = hash('default-player.webp');
const fc26 = loadFc26(fileURLToPath(new URL('../..', import.meta.url)));
const reported = { 202126: 'Kane', 277643: 'Yamal', 255253: 'V', 232580: 'Gabriel', 257534: 'Palmer', 220901: 'Raya', 246191: 'lvarez', 213331: 'Tah', 256079: 'Caicedo', 215441: 'Guirassy', 241651: 'keres', 237678: 'Konat', 247827: 'Olise', 256516: 'Williams', 240638: 'Reijnders', 256196: 'Pacho', 243014: 'Mbeumo', 271421: 'Dou', 193080: 'Gea', 226271: 'Ruiz', 200104: 'Son', 231866: 'Rodri', 228093: 'Thuram', 246104: 'Gravenberch', 216549: 'rloth', 257279: 'Baena', 264652: 'Barcola', 227796: 'Pulisic', 239231: 'Cucurella', 263578: 'Balde', 264453: 'Ven', 278046: 'Cubars' };
const byId = new Map(fc26.map(p => [p.id, p]));
const errors = [];
for (const [id, frag] of Object.entries(reported)) {
  const p = byId.get(id);
  if (!p) errors.push(`${id} (${frag}) missing from FC26 CSVs`);
  else if (!(p.short + ' ' + p.long).includes(frag)) errors.push(`${id} is ${p.short}, expected ${frag}`);
}
for (const p of fc26) {
  const f = `${p.id}.webp`;
  if (!existsSync(new URL(f, dir))) errors.push(`${p.id} ${p.short}: no face file`);
  else if (hash(f) === def) errors.push(`${p.id} ${p.short}: file equals default silhouette`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`player-faces: ${fc26.length} FC26 players resolve to a real face (${Object.keys(reported).length} reported checked)`);

