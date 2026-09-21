/** Compatibility entry point: one canonical generator writes all five cleaned CSVs. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./build-default-pool.py', import.meta.url));
const candidates = process.env.PYTHON ? [[process.env.PYTHON, []]] : [['python3', []], ['python', []], ['py', ['-3']]];
let launched = false;
for (const [binary, prefix] of candidates) {
 const result = spawnSync(binary, [...prefix, script], { stdio: 'inherit', windowsHide: true });
 if (result.error?.code === 'ENOENT') continue;
 launched = true;
 if (result.error) throw result.error;
 process.exitCode = result.status ?? 1;
 break;
}
if (!launched) throw new Error('Python 3 is required. Install Python or set PYTHON to its executable path.');
