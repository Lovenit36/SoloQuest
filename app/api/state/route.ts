import {context,persist,removeAccount,failure,sameOrigin,json,response} from '@/lib/server';
import {stateSchema} from '@/lib/state';
import {rate} from '@/lib/security';
export async function GET(req:Request){try{const c=await context(req);if(c.migrated&&c.state.profile){const result=await persist(c,c.state,c.row!.revision);return response({...result,migrationNote:'Your profile was kept. Previous demo places and simulated chats were removed.'})}return response({state:c.state,revision:c.row?.revision||0})}catch(e){return failure(e)}}
export async function PUT(req:Request){try{sameOrigin(req);const c=await context(req);await rate('state:'+c.userId,60);const b=await json(req);return response(await persist(c,stateSchema.parse(b.state),b.revision,b.tokens||{}))}catch(e){return failure(e)}}
export async function DELETE(req:Request){try{sameOrigin(req);const c=await context(req);await removeAccount(c.userId);return response({deleted:true})}catch(e){return failure(e)}}
