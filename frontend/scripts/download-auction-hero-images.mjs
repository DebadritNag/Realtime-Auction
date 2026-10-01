/**
 * download-auction-hero-images.mjs
 *
 * Downloads player face images ONLY for:
 *   - Auction players  (backend/data/default-pool/default-player-pool.csv)
 *   - Secret heroes     (backend/data/secret-heroes/hero-player-data.csv)
 *
 * External-pool players (external-players.csv) are intentionally skipped.
 * Already-downloaded images are kept and skipped.
 *
 * Images saved as /public/images/players/{player_id}.webp
 * Heroes saved as /public/images/players/hero_{slug}.webp
 * Mapping written to /public/images/players/image-map.json
 *
 * Usage: node frontend/scripts/download-auction-hero-images.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT_DIR = join(ROOT, 'public', 'images', 'players');
mkdirSync(OUT_DIR, { recursive: true });

// ── CSV parser (quoted-field aware) ───────────────────────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur); return out;
}
function parseCsv(filePath) {
  const lines = readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

// ── Long-name index (improves TheSportsDB matching) ───────────────────────────
const nameIndex = new Map();
try {
  const male = parseCsv(join(ROOT, 'male_players.csv'));
  for (const r of male) {
    if (r.player_id && !nameIndex.has(r.player_id)) nameIndex.set(r.player_id, { long: r.long_name || '', short: r.short_name || '' });
  }
  console.log(`📇 Loaded ${nameIndex.size} long-name mappings`);
} catch (e) { console.log('⚠️  male_players.csv not loaded:', e.message); }

// ── Only auction pool + heroes ────────────────────────────────────────────────
const poolPlayers = parseCsv(join(ROOT, '..', 'backend', 'data', 'default-pool', 'default-player-pool.csv'));
const heroPlayers = parseCsv(join(ROOT, '..', 'backend', 'data', 'secret-heroes', 'hero-player-data.csv'));

const playerMap = new Map();
for (const p of poolPlayers) {
  const id = (p.player_id || '').trim();
  const name = (p.name || p.short_name || '').trim();
  if (id && name) playerMap.set(id, { player_id: id, name });
}
const heroList = heroPlayers.map(h => ({ player_id: null, name: (h.name || '').trim() })).filter(h => h.name);

const allPlayers = [...playerMap.values(), ...heroList];
console.log(`\n📋 Downloading auction + hero images: ${allPlayers.length} (${playerMap.size} auction, ${heroList.length} heroes)\n`);

// ── Map file ──────────────────────────────────────────────────────────────────
const MAP_FILE = join(OUT_DIR, 'image-map.json');
let imageMap = {};
if (existsSync(MAP_FILE)) { try { imageMap = JSON.parse(readFileSync(MAP_FILE, 'utf8')); } catch {} }

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) { file.close(); downloadFile(res.headers.location, dest).then(resolve).catch(reject); return; }
      if (res.statusCode !== 200) { file.close(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file); file.on('finish', () => file.close(resolve));
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', err => { file.close(); reject(err); });
  });
}
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    let data = '';
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      res.on('data', c => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}
async function searchSportsDB(name) {
  if (!name) return { url: null };
  const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`;
  try {
    const data = await fetchJson(url);
    const players = data?.player;
    if (players === null || players === undefined) return { rateLimited: true };
    if (!players.length) return { url: null };
    const footballer = players.find(p => p.strSport === 'Soccer') ?? players[0];
    return { url: footballer?.strThumb || footballer?.strCutout || null };
  } catch { return { rateLimited: true }; }
}
function deAbbreviate(name) {
  const parts = name.split(/\s+/);
  if (parts.length > 1 && /^[A-Za-z]\.$/.test(parts[0])) return parts.slice(1).join(' ');
  return name;
}
function candidatesFor(player) {
  const list = [];
  if (player.player_id && nameIndex.has(player.player_id)) {
    const { long, short } = nameIndex.get(player.player_id);
    if (long) list.push(long);
    if (short && short !== long) list.push(short);
  }
  if (player.name) list.push(player.name);
  const deabbr = deAbbreviate(player.name);
  if (deabbr && deabbr !== player.name) list.push(deabbr);
  return [...new Set(list.filter(Boolean))];
}

// ── Main loop ───────────────────────────────────────────────────────────────
let downloaded = 0, skipped = 0, failed = 0, notFound = 0;
const failedList = [];
for (let i = 0; i < allPlayers.length; i++) {
  const player = allPlayers[i];
  const { player_id, name } = player;
  const mapKey = player_id ?? `hero:${name}`;
  const destFile = player_id
    ? join(OUT_DIR, `${player_id}.webp`)
    : join(OUT_DIR, `hero_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.webp`);

  if (existsSync(destFile) && imageMap[mapKey]) { skipped++; continue; }

  const names = candidatesFor(player);
  let imgUrl = null, matchedWith = null;
  for (const candidate of names) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(1200 + attempt * 1500);
      const res = await searchSportsDB(candidate);
      if (res.url) { imgUrl = res.url; matchedWith = candidate; break; }
      if (!res.rateLimited) break;
    }
    if (imgUrl) break;
  }

  if (!imgUrl) {
    notFound++; failedList.push({ mapKey, name, tried: names }); imageMap[mapKey] = null;
    console.log(`  ❓ [${i + 1}/${allPlayers.length}] ${name} — not found`);
    continue;
  }
  try {
    await downloadFile(imgUrl, destFile);
    imageMap[mapKey] = imgUrl; downloaded++;
    console.log(`  ✅ [${i + 1}/${allPlayers.length}] ${name} ← "${matchedWith}"${player_id ? '' : ' (hero)'}`);
  } catch (err) {
    failed++; failedList.push({ mapKey, name, reason: err.message }); imageMap[mapKey] = imgUrl;
    console.log(`  ⚠️  [${i + 1}] ${name} — download failed: ${err.message}`);
  }
  if ((downloaded + failed + notFound) % 15 === 0) writeFileSync(MAP_FILE, JSON.stringify(imageMap, null, 2));
}
writeFileSync(MAP_FILE, JSON.stringify(imageMap, null, 2));
if (failedList.length) writeFileSync(join(OUT_DIR, 'failed-auction-hero.json'), JSON.stringify(failedList, null, 2));

console.log(`
╔══════════════════════════════════════
║  Auction + Hero image download complete
║  ✅ Downloaded:  ${downloaded}
║  ⏩ Skipped:     ${skipped}
║  ❓ Not found:   ${notFound}
║  ⚠️  Failed:      ${failed}
╚══════════════════════════════════════
`);
