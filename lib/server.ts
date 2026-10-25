import {db,assert,verifyPlace} from './security';
import {requireUser} from './auth';
import {initialState,migrateState,type AppState} from './state';
import {localToUtc} from './time';
import {validate} from './planner';
import {cleanup} from './cleanup';
import {distanceKm,getPlace} from './providers';
export {failure,sameOrigin,response,json} from './security';
export async function context(req:Request){const userId=await requireUser(req);await cleanup();const row=await db().prepare('SELECT * FROM accounts WHERE user_id=?').bind(userId).first<{data:string;revision:number;write_token:string}>();const migrated=migrateState(row?JSON.parse(row.data):null);return {userId,row,state:migrated.state,migrated:migrated.migrated};}
export async function persist(c:Awaited<ReturnType<typeof context>>,state:AppState,revision:number,tokens:Record<string,string>={}){
 assert(Number.isInteger(revision)&&(c.row?.revision||0)===revision,'This plan changed in another tab. Reload before saving.',409);assert(state.profile,'Create your profile first.');validate(state.constraints,state.activities);
 if(state.constraints.mode==='Solo'||!state.profile?.social){state.constraints.mode='Solo';state.activities=state.activities.map(a=>({...a,shared:false}))}
 const known=new Set([...c.state.activities.map(a=>a.placeId),...c.state.saved]);
 for(const id of new Set([...state.activities.map(a=>a.placeId),...state.saved])){if(known.has(id))continue;const proof=await verifyPlace(tokens[id]);assert(proof.id===id,'Place reference mismatch.');}
 for(const a of state.activities){
  const old=c.state.activities.find(x=>x.placeId===a.placeId);
  const moved=JSON.stringify(c.state.constraints.location)!==JSON.stringify(state.constraints.location);
  if(!old||moved){const proof=await verifyPlace(tokens[a.placeId]);assert(proof.id===a.placeId&&Number.isFinite(proof.latitude)&&Number.isFinite(proof.longitude)&&distanceKm(state.constraints.location,proof)<=35,'This place is outside your selected location. Change your city first.');}
  if(a.placeId.startsWith('tm:')&&(!old||moved||old.start!==a.start||c.state.constraints.date!==state.constraints.date)){
   const place=await getPlace(a.placeId);assert(place.eventStart&&Math.abs(place.eventStart-localToUtc(state.constraints.date,a.start,state.constraints.location.timezone))<60000,'Use the event’s actual date and start time.');
  }
 }
 const token=crypto.randomUUID(),now=Date.now(),data=JSON.stringify(state),next=revision+1;
 const q=[db().prepare('INSERT INTO accounts(user_id,data,revision,updated_at,write_token) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at,write_token=excluded.write_token WHERE accounts.revision=?').bind(c.userId,data,next,new Date(now).toISOString(),token,revision),db().prepare('DELETE FROM shared_stops WHERE user_id=? AND EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND write_token=?)').bind(c.userId,c.userId,token)];
 for(const a of state.activities.filter(a=>a.shared)){q.push(db().prepare('INSERT INTO shared_stops(id,user_id,place_id,start_at,end_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND write_token=?)').bind(a.id,c.userId,a.placeId,localToUtc(state.constraints.date,a.start,state.constraints.location.timezone),localToUtc(state.constraints.date,a.end,state.constraints.location.timezone),c.userId,token))}
 // Removing a shared stop revokes group membership immediately, in the same transaction.
 q.push(db().prepare('DELETE FROM room_members WHERE user_id=? AND room_id IN (SELECT r.id FROM chat_rooms r WHERE r.kind=\'group\' AND NOT EXISTS(SELECT 1 FROM shared_stops s WHERE s.user_id=? AND s.place_id=r.place_id AND MIN(s.end_at,r.slot_at+3600000)-MAX(s.start_at,r.slot_at)>=900000)) AND EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND write_token=?)').bind(c.userId,c.userId,c.userId,token));
 const result=await db().batch(q);assert((result[0].meta.changes||0)>0,'This plan changed in another tab. Reload before saving.',409);return {state,revision:next};
}
export async function removeAccount(userId:string){await db().batch([
 db().prepare('DELETE FROM chat_messages WHERE user_id=? OR room_id IN (SELECT id FROM connections WHERE user_a=? OR user_b=?)').bind(userId,userId,userId),
 db().prepare('DELETE FROM room_members WHERE user_id=? OR room_id IN (SELECT id FROM connections WHERE user_a=? OR user_b=?)').bind(userId,userId,userId),
 db().prepare('DELETE FROM chat_rooms WHERE id IN (SELECT id FROM connections WHERE user_a=? OR user_b=?)').bind(userId,userId),
 db().prepare('DELETE FROM connections WHERE user_a=? OR user_b=?').bind(userId,userId),
 db().prepare('DELETE FROM user_blocks WHERE user_id=? OR target_id=?').bind(userId,userId),
 db().prepare('DELETE FROM shared_stops WHERE user_id=?').bind(userId),db().prepare('DELETE FROM reports WHERE user_id=?').bind(userId),db().prepare('DELETE FROM local_sessions WHERE user_id=?').bind(userId),db().prepare('DELETE FROM local_credentials WHERE user_id=?').bind(userId),db().prepare('DELETE FROM accounts WHERE user_id=?').bind(userId)
 ]);}
