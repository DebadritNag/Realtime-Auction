// One-off generator for backend/data/restore/super-league-auction-2026-v3.json (UTF-8, no BOM).
// Entries: "Name|POS|priceCr|U?"; R: = retained (always 15 Cr). Source: the user's screenshots, transcribed by the orchestrator.
import { writeFileSync } from 'node:fs';
const T = [
  ['Ritzz FC', 79.5, [
    'R:A. Bastoni|CB', 'G. Donnarumma|GK|5', 'Y. Sommer|GK|3', 'D. Upamecano|CB|8', 'D. Dumfries|RB|5.5', 'Y. Tielemans|CM|4']],
  ['SIDERALE', 44, [
    'R:F. Valverde|CM', 'R:V. van Dijk|CB', 'V. Gyökeres|ST|8.5', 'H. Çalhanoğlu|CDM|8', 'Nico Williams|LM|6', 'N. Schlotterbeck|CB|8.5',
    'M. Neuer|GK|6.5', 'Marcos Llorente|RB|5.5', 'K. Mitoma|LM|2|U', 'A. Semenyo|RM|1|U']],
  ['BGT', 62, [
    'R:Lamine Yamal|RM', 'R:Pedri|CM', 'Rodri|CDM|12', 'J. Oblak|GK|3', 'M. Ødegaard|CM|6.5', 'João Cancelo|RB|6.5']],
  ['DDD', 63, [
    'Alisson|GK|3.5', 'D. Rice|CDM|9.5', 'K. De Bruyne|CM|12', 'Iñigo Martínez|CB|3.5', 'P. Foden|RW|6', 'A. Davies|LB|4', 'Rafael Leão|LW|9',
    'B. Kamara|CDM|3|U', 'Iñaki Williams|RM|2|U', 'J. Frimpong|RB|4.5']],
  ['RedBull FC', 67, [
    'J. Kimmich|CDM|10', 'Vini Jr.|LW|10', 'J. Musiala|CAM|8', 'L. Messi|RW|15', 'T. Alexander-Arnold|RB|7', 'Ederson|GK|3']],
  ['Dakshineswar FC', 42.5, [
    'R:W. Saliba|CB', 'Neymar Jr|LW|11', 'K. Kvaratskhelia|LW|8.5', 'S. Guirassy|ST|3', 'Bruno Guimarães|CM|7', 'Carvajal|RB|3', 'Fabián Ruiz|CM|6',
    'E. Camavinga|CM|3', 'P. Hincapié|CB|4', 'R. Araujo|CB|7', 'M. Rogers|CAM|2|U', 'Pau Cubarsí|CB|3', 'I. Toney|ST|1|U', 'K. Adeyemi|LM|2|U', 'Joan García|GK|2|U']],
  ['Fidodido FC', 53, [
    'R:O. Dembélé|ST', 'R:Bremer|CB', 'David Raya|GK|4', 'J. Koundé|RB|9', 'M. Caicedo|CDM|8', 'G. Kobel|GK|5.5', 'Nuno Mendes|LB|9.5', 'M. Kudus|RW|1|U']],
  ['APOLLO FC', 13.5, [
    'R:A. Hakimi|RB', 'R:Vitinha|CM', 'E. Haaland|ST|5.5', 'Raphinha|LM|9.5', 'T. Courtois|GK|8', 'M. ter Stegen|GK|8.5', 'Rúben Dias|CB|8', 'T. Reijnders|CM|6',
    'F. Dimarco|LB|11', 'João Neves|CM|6', 'Rodrygo|RW|5', 'C. Pulisic|RW|3', 'A. Laporte|CB|3|U', 'D. Alaba|CB|3']],
];
const teams = T.map(([name, purse, entries]) => {
  const players = entries.map(e => {
    const retained = e.startsWith('R:');
    const [n, position, price, tag] = e.replace(/^R:/, '').split('|');
    return { name: n, position, acquisition: retained ? 'RETENTION' : 'AUCTION', priceCr: retained ? 15 : Number(price), underdog: (retained ? price : tag) === 'U' || tag === 'U' };
  });
  const retainedCount = players.filter(p => p.acquisition === 'RETENTION').length;
  return { name, squadSize: players.length, remainingPurseCr: purse, retainedCount, auctionCount: players.length - retainedCount, players };
});
const VERIFY = {
  'Ritzz FC': 'The screenshot may render "Ri" as "Rl" (Rltzz FC). Confirm the spelling of Ritzz FC.',
  'Dakshineswar FC': 'The screenshot shows "Dakshineswar fc"; confirm the casing.',
  'Fidodido FC': 'An earlier snapshot used "FidoDido FC"; the newest screenshot shows "Fidodido FC".',
};
for (const t of teams) if (VERIFY[t.name]) t.verify = VERIFY[t.name];
const snapshot = { version: 1, name: 'Super League Football Auction 2026 (Restored v3)', hostTeam: 'Ritzz FC', teams };
writeFileSync(process.argv[2], JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log(teams.map(t => `${t.name} ${t.squadSize}/${t.retainedCount}/${t.auctionCount}`).join('; '));
