import assert from 'node:assert/strict';
import {load,sqlite} from './test-harness.mjs';
const {generate,validate,isOpen}=load('lib/planner.ts'),{initialState}=load('lib/state.ts'),{localToUtc,slots}=load('lib/time.ts');
// Provider-shaped fixtures exist only in tests. Runtime has no seeded catalog.
const places=[['g:cafe','Food & drink',60,null,null],['g:museum','Art & culture',90,12,'EUR'],['g:park','Outdoors',60,0,'EUR']].map(([id,category,duration,priceMin,currency])=>({id,title:id,category,duration,priceMin,currency,indoor:category==='Outdoors'?false:true,rating:4}));
const c={...initialState().constraints,date:'2026-11-10'};let count=0;
for(const budget of [0,5,12,35,100])for(const start of [540,660,900,1080])for(const end of [1020,1140,1260,1440])for(const rain of [true,false])for(const mood of ['Easygoing','Curious','Adventurous']){
 if(end-start<30)continue;const input={...c,budget,start,end,rain,mood},plan=generate(input,places);assert.ok(validate(input,plan)<=budget);assert.ok(!rain||plan.every(a=>places.find(p=>p.id===a.placeId).indoor!==false));assert.ok(plan.every(a=>places.some(p=>p.id===a.placeId)));count++;
}
assert.deepEqual(generate(c,[]),[]);const first=generate(c,places);assert.ok(first.length);const pinned={...first[0],pinned:true,shared:true};assert.deepEqual(generate(c,places,[pinned]).find(a=>a.id===pinned.id),pinned);
assert.throws(()=>validate({...c,date:'2026-02-30'},[]));assert.throws(()=>validate({...c,budget:-1},[]));assert.throws(()=>validate({...c,end:c.start},[]));assert.throws(()=>validate(c,[first[0],{...first[0],id:'duplicate'}]));assert.throws(()=>validate(c,[{...first[0],budget:1000}]));
assert.equal(new Date(localToUtc('2026-11-10',600,'Asia/Kolkata')).toISOString(),'2026-11-10T04:30:00.000Z');assert.throws(()=>localToUtc('2026-03-29',150,'Europe/Berlin'),/clocks change/);assert.equal(new Date(localToUtc('2026-10-25',150,'Europe/Berlin')).toISOString(),'2026-10-25T00:30:00.000Z');
assert.equal(slots(0,14*60000).length,0);assert.equal(slots(0,15*60000).length,1);
const monday={periods:[{open:{day:1,hour:9,minute:0},close:{day:1,hour:17,minute:0}}]};assert.equal(isOpen(monday,'2026-11-09',600,660),true);assert.equal(isOpen(monday,'2026-11-10',600,660),false);
sqlite.close();console.log(`PASS ${count} planner scenarios plus budget/time validation, no fabricated results, pinned stops, opening hours, timezone conversion and DST.`);
