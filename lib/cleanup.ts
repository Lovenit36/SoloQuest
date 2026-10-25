import {db} from './security';
export async function cleanup(now=Date.now()){
 await db().batch([
 db().prepare('DELETE FROM chat_messages WHERE room_id IN (SELECT id FROM chat_rooms WHERE kind=\'group\' AND expires_at<=?)').bind(now),
 db().prepare('DELETE FROM room_members WHERE room_id IN (SELECT id FROM chat_rooms WHERE kind=\'group\' AND expires_at<=?)').bind(now),
 db().prepare('DELETE FROM chat_rooms WHERE kind=\'group\' AND expires_at<=?').bind(now),
 db().prepare('DELETE FROM local_sessions WHERE expires_at<=?').bind(now),
 db().prepare('DELETE FROM request_limits WHERE reset_at<?').bind(now-3600000)
 ]);
}
