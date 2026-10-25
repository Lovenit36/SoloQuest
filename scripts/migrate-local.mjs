import {mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {configureToolEnvironment} from './tool-environment.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);configureToolEnvironment(root);
const hosting=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(!hosting.d1)throw Error('The project requires its DB D1 binding.');
mkdirSync('.sites-runtime',{recursive:true});
const config={name:'soloquest-local-migrations',main:resolve('worker/index.ts'),compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:hosting.d1,database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:resolve('drizzle')}]};
writeFileSync('.sites-runtime/local-migrations.json',JSON.stringify(config,null,2));
// Adopt the original v1 local schema, which was installed by direct SQL before
// migration tracking existed. This never changes account or conversation data.
const dbDir=resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if(existsSync(dbDir))for(const file of readdirSync(dbDir).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')){
 const local=new DatabaseSync(resolve(dbDir,file),{readOnly:true});
 const tables=local.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
 const legacy=tables.includes('accounts')&&tables.includes('reports')&&local.prepare('PRAGMA table_info(accounts)').all().some(c=>c.name==='revision');
 const tracked=tables.includes('d1_migrations')&&local.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get('0000_moaning_nuke.sql');
 local.close();
 if(legacy&&!tracked){
  const sql="CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT OR IGNORE INTO d1_migrations(name) VALUES('0000_moaning_nuke.sql');";
  const adopted=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute',hosting.d1,'--local','--config','.sites-runtime/local-migrations.json','--persist-to',resolve('.wrangler/state'),'--command',sql],{stdio:'inherit'});
  if(adopted.status!==0)throw Error('Could not register the existing v1 migration.');
  console.log('Registered the existing v1 local schema; applying only new migrations.');
 }
}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply',hosting.d1,'--local','--config','.sites-runtime/local-migrations.json','--persist-to',resolve('.wrangler/state')],{stdio:'inherit'});
if(result.error)throw result.error;if(result.status!==0)throw Error('Local database migration failed. See the message above.');
