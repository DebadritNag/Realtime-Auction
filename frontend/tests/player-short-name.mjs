// Player cards must show the CSV short_name. Runs the real mapPlayer on DTOs built from the FC26 CSVs
// and fails if any component or page renders the long name (fullName).
import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFc26 } from '../scripts/fc26-csv.mjs';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const js = ts.transpileModule(readFileSync(join(src, 'services/contract.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { mapPlayer } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const fc26 = new Map(loadFc26(fileURLToPath(new URL('../..', import.meta.url))).map(p => [p.id, p]));
const state = { soldPlayers: [], teams: [] };
const expected = { 277643: 'Lamine Yamal', 231747: 'K. Mbappé', 255253: 'Vitinha', 231866: 'Rodri', 232580: 'Gabriel', 202126: 'H. Kane' };
for (const [id, short] of Object.entries(expected)) {
  const row = fc26.get(id);
  assert.ok(row, `${id} missing from FC26 CSVs`);
  assert.equal(row.short, short, `${id} CSV short_name`);
  // Same shape the backend sends: name = short_name, fullName = long_name.
  const dto = { id, name: row.short, fullName: row.long, position: 'MID', ovr: 90, stats: {}, basePriceCr: 1, potId: 'MID', status: 'WAITING' };
  const player = mapPlayer(dto, state);
  assert.equal(player.name, short, `${id} card name`);
  assert.equal(player.fullName, row.long, `${id} keeps the long name for search only`);
}

const files = [];
const walk = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.tsx')) files.push(p); } };
walk(join(src, 'components')); walk(join(src, 'app'));
const offenders = files.filter(f => /\bfullName\b/.test(readFileSync(f, 'utf8')));
assert.deepEqual(offenders, [], 'Components must render player.name (CSV short_name), never fullName');
console.log(`player-short-name: ${Object.keys(expected).length} players map to short_name; ${files.length} UI files free of fullName`);
