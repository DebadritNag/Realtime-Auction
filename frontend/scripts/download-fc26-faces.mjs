/**
 * download-fc26-faces.mjs
 * Downloads FC26 player faces from the player_face_url column of the FC26 CSVs (cdn.sofifa.net),
 * which is keyed by the same id the FC26 catalog uses, so the face always matches the player.
 * Saves public/images/players/{id}.webp (240px) and records the source in image-map.json.
 * Usage: node frontend/scripts/download-fc26-faces.mjs [--force-missing-only]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { loadFc26 } from './fc26-csv.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'images', 'players');
const mapPath = join(OUT, 'image-map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const missingOnly = process.argv.includes('--force-missing-only');
const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Referer: 'https://sofifa.com/' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hashes = new Map(); let ok = 0, failed = [];
for (const p of loadFc26(join(ROOT, '..'))) {
  const file = join(OUT, `${p.id}.webp`);
  if (missingOnly && existsSync(file)) continue;
  const url = p.face.replace(/_\d+\.png$/, '_240.png');
  if (!/^https:\/\/cdn\.sofifa\.net\//.test(url)) { failed.push([p.id, p.short, 'no usable face url']); continue; }
  let buf = null;
  for (let a = 0; a < 3 && !buf; a++) {
    try { const r = await fetch(url, { headers }); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); else await sleep(1500); } catch { await sleep(1500); }
  }
  if (!buf) { failed.push([p.id, p.short, 'download failed']); continue; }
  const h = createHash('sha256').update(buf).digest('hex');
  hashes.set(h, [...(hashes.get(h) ?? []), p.id]);
  await sharp(buf).flatten({ background: '#1e293b' }).resize(240, 240).webp({ quality: 82 }).toFile(file);
  map[p.id] = url; ok++;
  await sleep(300);
}
writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('saved', ok, 'failed', failed.length, JSON.stringify(failed));
console.log('duplicate images (possible placeholders):', JSON.stringify([...hashes.values()].filter(v => v.length > 1)));
