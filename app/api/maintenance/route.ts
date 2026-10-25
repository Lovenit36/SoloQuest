import {cleanup} from '@/lib/cleanup';import {settings,assert,failure,response} from '@/lib/security';
export async function POST(req:Request){try{const secret=settings().MAINTENANCE_SECRET;assert(secret&&req.headers.get('authorization')===`Bearer ${secret}`,'Not authorized.',401);await cleanup();return response({ok:true})}catch(e){return failure(e)}}
