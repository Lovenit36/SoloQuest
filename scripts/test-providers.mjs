import assert from 'node:assert/strict';
import {load,env,sqlite,identity,request} from './test-harness.mjs';
const {locations,searchPlaces,searchEvents,getPlace}=load('lib/providers.ts'),{verifyPlace}=load('lib/security.ts'),{initialState}=load('lib/state.ts');
const photo=load('app/api/photo/route.ts');
const loc=initialState().constraints.location;let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
const originalFetch=globalThis.fetch;
// These are isolated adapter fixtures, not a runtime demo mode or seed database.
const venue={id:'provider_place',displayName:{text:'Provider fixture venue'},formattedAddress:'Test address',location:{latitude:52.52,longitude:13.405},googleMapsUri:'https://maps.google.com/?cid=123',websiteUri:'https://example.test/venue',types:['museum'],photos:[{name:'places/provider_place/photos/photo_reference',googleMapsUri:'https://maps.google.com/photo/123',authorAttributions:[{displayName:'Fixture photographer',uri:'https://maps.google.com/contrib/123'}]}],businessStatus:'OPERATIONAL',regularOpeningHours:{periods:[{open:{day:2,hour:9,minute:0},close:{day:2,hour:18,minute:0}}]}};
let mode='valid';globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(mode==='quota')return Response.json({error:'quota'},{status:429});
 if(mode==='auth')return Response.json({error:'invalid provider key'},{status:403});
 if(u.includes('geocoding-api'))return Response.json({results:[{id:1,name:'Berlin',country:'Germany',country_code:'DE',latitude:52.52,longitude:13.405,timezone:'Europe/Berlin'}]});
 if(u.includes(':searchText')){eq(options.headers['X-Goog-Api-Key'],'fixture-only');return Response.json({places:mode==='empty'?[]:[venue,{...venue,id:'outside_city',location:{latitude:40,longitude:0}},{...venue,id:'closed',businessStatus:'CLOSED_PERMANENTLY'}]})}
 if(u.includes('/media'))return Response.json({photoUri:'https://images.googleusercontent.com/fixture'});
 if(u.includes('images.googleusercontent.com'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});
 if(u.includes('places.googleapis.com'))return Response.json(venue);
 if(u.includes('ticketmaster'))return Response.json({_embedded:{events:[{id:'event_1',name:'Fixture event',url:'https://ticketmaster.com/event/fixture',images:[{url:'https://images.ticketmaster.com/test.jpg',width:1024}],dates:{start:{dateTime:'2026-11-10T18:00:00Z'},status:{code:'onsale'}},_embedded:{venues:[{name:'Fixture venue',city:{name:'Berlin'},location:{latitude:'52.52',longitude:'13.405'}}]}}]}});
 throw Error('Unexpected test provider URL');
};
try{
 await assert.rejects(()=>searchPlaces(loc,'','All experiences'),/GOOGLE_PLACES_API_KEY/);checks++;
 env.GOOGLE_PLACES_API_KEY='fixture-only';const results=await searchPlaces(loc,'','All experiences');eq(results.length,1);const p=results[0];eq(p.id,'g:provider_place');eq(p.title,venue.displayName.text);eq(p.url,venue.websiteUri);eq(p.photoAuthors[0].name,'Fixture photographer');eq(p.photoMapsUrl,venue.photos[0].googleMapsUri);eq(p.priceMin,null);eq(p.priceLabel,'Price not supplied');eq((await verifyPlace(p.token)).id,p.id);eq((await getPlace(p.id)).id,p.id);
 const found=await locations('Berlin');eq(found[0].timezone,'Europe/Berlin');eq(found[0].countryCode,'DE');
 identity('photo-viewer');let r=await photo.GET(request('GET',undefined,p.photoUrl.replace('/api/','')));eq(r.status,200);eq(r.headers.get('content-type'),'image/jpeg');eq(r.headers.get('cache-control'),'private,no-store');identity(null);eq((await photo.GET(request('GET',undefined,p.photoUrl.replace('/api/','')))).status,401);
 mode='empty';eq((await searchPlaces(loc,'','All experiences')).length,0);mode='quota';await assert.rejects(()=>searchPlaces(loc,'','All experiences'),/quota/);checks++;mode='auth';await assert.rejects(()=>searchPlaces(loc,'','All experiences'),/authorization/);checks++;mode='valid';
 await assert.rejects(()=>searchEvents(loc,'2026-11-10'),/TICKETMASTER/);checks++;env.TICKETMASTER_API_KEY='fixture-only';const events=await searchEvents(loc,'2026-11-10');eq(events[0].id,'tm:event_1');eq(events[0].eventStart,Date.parse('2026-11-10T18:00:00Z'));eq(events[0].photoUrl,'https://images.ticketmaster.com/test.jpg');
}catch(e){throw e}finally{globalThis.fetch=originalFetch;sqlite.close()}
console.log(`PASS ${checks} provider assertions: real response mapping, signed IDs, bounds, photos and attribution, event dates, missing keys, empty results, quota and authorization errors. Live credentials were not used.`);
