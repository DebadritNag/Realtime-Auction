import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Vercel installs only frontend dependencies. Even type-only imports must not
// pull server modules (and their runtime dependencies) into the TS program.
const root=fileURLToPath(new URL('../',import.meta.url));
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
assert.equal(config.error,undefined);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const program=ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:true,incremental:false});
const backend=path.resolve(root,'../backend')+path.sep;
const leaks=program.getSourceFiles().filter(f=>path.resolve(f.fileName).startsWith(backend));
assert.deepEqual(leaks.map(f=>f.fileName),[], 'Frontend type checking must not load backend files');
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));process.exit(1);}
console.log('PASS: frontend type checks without any backend source or dependency in its TypeScript program.');
