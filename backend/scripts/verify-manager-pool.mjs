import {readFile} from 'node:fs/promises';
import {importExternalCsv} from '../dist/modules/manager-mode/external-import.service.js';
const report=importExternalCsv(await readFile(new URL('../data/manager-mode/external-players.csv',import.meta.url),'utf8'),[]);
if(!report.validPlayers||report.invalidRows.length)throw Error('Bundled Manager Mode external player CSV is empty or invalid.');
console.log('Verified bundled Manager Mode external pool: '+report.validPlayers+' players.');
