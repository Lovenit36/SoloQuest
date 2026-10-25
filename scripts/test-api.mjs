import assert from 'node:assert/strict';
import {sqlite,env,identity,load,request} from './test-harness.mjs';
const stateApi=load('app/api/state/route.ts'),social=load('app/api/social/route.ts'),chats=load('app/api/chats/route.ts'),chat=load('app/api/chat/route.ts'),auth=load('app/api/auth/route.ts'),discover=load('app/api/discover/route.ts'),report=load('app/api/report/route.ts');
const {signPlace}=load('lib/security.ts'),{cleanup}=load('lib/cleanup.ts'),{initialState}=load('lib/state.ts'),{persist}=load('lib/server.ts');
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};const ok=a=>{assert.ok(a);checks++};
const originalNow=Date.now,now=Date.parse('2026-11-10T08:00:00Z');Date.now=()=>now;
const token=await signPlace({id:'g:test_venue',latitude:52.52,longitude:13.405});
const tokens={'g:test_venue':token};
const save=async(s,r)=>stateApi.PUT(request('PUT',{state:s,revision:r,tokens}));
const post=body=>social.POST(request('POST',body,'social'));
const get=()=>stateApi.GET(request());
const getChats=()=>chats.GET(request('GET',undefined,'chats'));
const send=(roomId,text='A real test message',clientId=crypto.randomUUID())=>chat.POST(request('POST',{roomId,text,clientId},'chat'));
const read=id=>chat.GET(request('GET',undefined,'chat?id='+id));
function account(name,start=600,end=660,placeId='g:test_venue'){
 const s=initialState();s.profile={name,bio:'Test fixture',city:'Berlin',area:'',interests:['Art & culture'],adult:true,social:true,photo:''};s.constraints={...s.constraints,date:'2026-11-10',start:480,end:1200,location:{...s.constraints.location,timezone:'UTC'},mode:'Social'};s.activities=[{id:'stop',placeId,start,end,budget:5,pinned:false,shared:true,done:false}];return s;
}
eq((await get()).status,401);
identity('test-a');let r=await save(account('Explorer A'),0);eq(r.status,200);let a=await r.json();eq(a.revision,1);
eq((await save(a.state,0)).status,409);
let forged=structuredClone(a.state);forged.activities[0].placeId='g:invented';eq((await save(forged,a.revision)).status,400);
const cross=request('PUT',{state:a.state,revision:a.revision},'state','https://soloquest.test',{'origin':'https://evil.test'});eq((await stateApi.PUT(cross)).status,403);
identity('test-b');eq((await (await get()).json()).state.profile,null);r=await save(account('Explorer B',615,675),0);eq(r.status,200);let b=await r.json();
identity('test-c');r=await save(account('Explorer C',700,760),0);eq(r.status,200);
identity('test-a');let data=await (await social.GET(request())).json();eq(data.people.length,1);eq(data.people[0].id,'test-b');eq(data.people[0].startAt,Date.parse('2026-11-10T10:15:00Z'));ok(!('email' in data.people[0]));eq((await (await getChats()).json()).rooms.length,0);
const g=data.groups.find(g=>g.slot===Date.parse('2026-11-10T10:00:00Z'));ok(g);eq(g.members,0);eq(g.expiresAt-g.opensAt,86400000);
r=await post({action:'join_group',placeId:g.placeId,slot:g.slot});eq(r.status,200);eq((await r.json()).id,g.id);eq((await (await getChats()).json()).rooms.length,1);eq((await (await read(g.id)).json()).messages.length,0);
identity('test-c');eq((await post({action:'join_group',placeId:g.placeId,slot:g.slot})).status,403);eq((await read(g.id)).status,403);
identity('test-b');eq((await post({action:'join_group',placeId:g.placeId,slot:g.slot})).status,200);eq((await send(g.id,'Hello from B','test_message')).status,200);eq((await send(g.id,'Hello from B','test_message')).status,200);
identity('test-a');let log=await (await read(g.id)).json();eq(log.messages.length,1);eq(log.messages[0].author,'Explorer B');eq(log.messages[0].text,'Hello from B');
r=await post({action:'connect',target:'test-b'});eq(r.status,200);const dm=(await r.json()).id;eq((await read(dm)).status,403);eq((await post({action:'accept',target:'test-b'})).status,403);
identity('test-b');eq((await (await social.GET(request())).json()).requests.length,1);eq((await post({action:'accept',target:'test-a'})).status,200);eq((await send(dm,'Personal hello','direct_message')).status,200);
identity('test-a');eq((await (await read(dm)).json()).messages[0].text,'Personal hello');
// Pagination is stable even if >100 messages share a millisecond.
for(let i=0;i<103;i++)sqlite.prepare('INSERT INTO chat_messages VALUES(?,?,?,?,?)').run('page_'+String(i).padStart(3,'0'),dm,'test-b','pagination fixture',now+1);
log=await (await read(dm)).json();eq(log.messages.length,100);eq(log.hasMore,true);let first=log.messages[0];const older=await (await chat.GET(request('GET',undefined,`chat?id=${dm}&before=${first.time}&beforeId=${first.id}`))).json();eq(older.messages.length,4);eq(new Set([...log.messages,...older.messages].map(m=>m.id)).size,104);
// Group membership is revoked atomically; personal connections survive itinerary edits.
a.state.activities[0].shared=false;r=await save(a.state,a.revision);eq(r.status,200);a=await r.json();eq((await read(g.id)).status,403);eq((await read(dm)).status,200);eq((await (await social.GET(request())).json()).groups.length,0);
// Compare-and-swap guard protects the relational shared-stop index as well as JSON.
const staleCtx={userId:'test-a',row:{revision:a.revision},state:structuredClone(a.state)};a.state.activities[0].shared=true;r=await save(a.state,a.revision);a=await r.json();
await assert.rejects(()=>persist(staleCtx,{...staleCtx.state,activities:[]},staleCtx.row.revision,tokens),/another tab/);checks++;eq(sqlite.prepare('SELECT COUNT(*) n FROM shared_stops WHERE user_id=?').get('test-a').n,1);
eq((await post({action:'join_group',placeId:g.placeId,slot:g.slot})).status,200);
// Solo revokes every shared group and matching record.
a.state.constraints.mode='Solo';r=await save(a.state,a.revision);a=await r.json();eq(a.state.activities[0].shared,false);eq((await read(g.id)).status,403);eq((await read(dm)).status,200);
// Physical expiry removes messages, membership and room, but keeps direct history.
Date.now=()=>g.expiresAt+1;await cleanup();eq(sqlite.prepare('SELECT COUNT(*) n FROM chat_rooms WHERE id=?').get(g.id).n,0);eq(sqlite.prepare('SELECT COUNT(*) n FROM chat_messages WHERE room_id=?').get(g.id).n,0);eq(sqlite.prepare('SELECT COUNT(*) n FROM room_members WHERE room_id=?').get(g.id).n,0);eq((await read(dm)).status,200);Date.now=()=>now;
// Location proof cannot be moved to another city.
const moved=structuredClone(a.state);moved.constraints.location.latitude=40;eq((await save(moved,a.revision)).status,400);
// No configured providers -> explicit error, never fallback results.
eq((await discover.POST(request('POST',{location:a.state.constraints.location,kind:'places'},'discover'))).status,503);
// Blocking removes the permanent room and prevents messages in both directions.
eq((await post({action:'block',target:'test-b'})).status,200);eq((await read(dm)).status,403);identity('test-b');eq((await send(dm)).status,403);eq((await post({action:'connect',target:'test-a'})).status,403);
eq((await report.POST(request('POST',{target:'test-a',reason:'Testing report persistence'}))).status,200);
// Real local authentication, hashed passwords and secure session cookie; never enabled off loopback.
identity(null);env.LOCAL_AUTH_ENABLED='true';eq((await auth.POST(request('POST',{action:'register',email:'local@example.test',password:'secure-test-password'},'auth'))).status,403);
const localReq=(body,cookie)=>request('POST',body,'auth','http://127.0.0.1:5173',cookie?{cookie}:{});
r=await auth.POST(localReq({action:'register',email:'local@example.test',password:'secure-test-password'}));eq(r.status,200);const cookie=r.headers.get('set-cookie');ok(cookie.includes('HttpOnly'));ok(cookie.includes('SameSite=Strict'));const credentials=sqlite.prepare('SELECT * FROM local_credentials').get();ok(credentials.hash!=='secure-test-password');eq(credentials.hash.length,64);
const localGet=request('GET',undefined,'auth','http://127.0.0.1:5173',{cookie});eq((await (await auth.GET(localGet)).json()).userId,credentials.user_id);eq((await auth.POST(localReq({action:'login',email:'local@example.test',password:'wrong-test-password'}))).status,401);eq((await auth.POST(localReq({action:'login',email:'local@example.test',password:'secure-test-password'}))).status,200);
eq((await auth.POST(localReq({action:'logout'},cookie))).status,200);eq((await (await auth.GET(localGet)).json()).userId,null);
// Legacy migration keeps the profile and discards demo records.
identity('legacy');sqlite.prepare('INSERT INTO accounts(user_id,data,revision,updated_at) VALUES(?,?,?,?)').run('legacy',JSON.stringify({profile:account('Legacy').profile,activities:[{placeId:'coffee'}],rooms:[{messages:[{text:'Fake reply'}]}]}),2,'test');r=await get();eq(r.status,200);const legacy=await r.json();eq(legacy.state.profile.name,'Legacy');eq(legacy.state.activities.length,0);ok(!('rooms' in legacy.state));eq(legacy.revision,3);
identity('test-b');eq((await stateApi.DELETE(request('DELETE'))).status,200);eq((await (await get()).json()).state.profile,null);eq(sqlite.prepare('SELECT COUNT(*) n FROM reports WHERE user_id=?').get('test-b').n,0);
Date.now=originalNow;sqlite.close();console.log(`PASS ${checks} API assertions: real identity, account isolation, signed places, location checks, atomic saves, exact overlap, ownerless joining, mutual DMs, idempotent messages, stable pagination, unsharing, expiry deletion, blocking, local credentials and migration.`);
