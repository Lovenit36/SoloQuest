import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
if(Number(process.versions.node.split('.')[0])<24)throw Error('Install Node.js 24 or newer before running setup.');
if(!existsSync('.dev.vars')){
 const content=readFileSync('.dev.vars.example','utf8').replace('PLACE_TOKEN_SECRET=','PLACE_TOKEN_SECRET='+randomBytes(32).toString('hex')).replace('MAINTENANCE_SECRET=','MAINTENANCE_SECRET='+randomBytes(32).toString('hex'));
 writeFileSync('.dev.vars',content,{mode:0o600});console.log('Created .dev.vars with local-only account support and random signing/cleanup secrets. Add provider keys there.');
}else console.log('Kept your existing .dev.vars unchanged.');
await import('./migrate-local.mjs');
console.log('Setup complete. Add GOOGLE_PLACES_API_KEY in .dev.vars, then run npm run dev:local.');
