// Test-only runtime: real SQLite, D1-compatible transactions and request identity.
// Fixture data never loads in the application or the downloadable local database.
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
export const sqlite=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Prepared{
 constructor(sql,args=[]){this.sql=sql;this.args=args}
 bind(...args){return new Prepared(this.sql,args)}
 async first(){return sqlite.prepare(this.sql).get(...this.args)||null}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.args),success:true,meta:{}}}
 async run(){return {success:true,results:[],meta:sqlite.prepare(this.sql).run(...this.args)}}
}
export const env={PLACE_TOKEN_SECRET:'test-only-signing-secret-not-a-real-provider-key',DB:{prepare:sql=>new Prepared(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
let user=null;export const identity=id=>{user=id};const cache=new Map();
export function load(path){let file=resolve(path);if(!existsSync(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>{if(name==='cloudflare:workers')return {env};if(name==='next/headers')return {headers:async()=>new Headers(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{})};if(name==='next/navigation')return {redirect:()=>{throw Error('Unexpected redirect')}};if(name.startsWith('@/'))return load(resolve(name.slice(2)));if(name.startsWith('.'))return load(resolve(dirname(file),name));return nativeRequire(name)};
 new Function('exports','require','module',js)(module.exports,req,module);return module.exports;
}
export function request(method='GET',body,path='state',origin='https://soloquest.test',headers={}){return new Request(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json',origin,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})}
