import {localToUtc} from './time';
import type {Activity,Constraints,Place} from './state';
export {time} from './time';
export type {Activity,Constraints} from './state';
export function validate(c:Constraints,activities:Activity[]){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!Number.isFinite(Date.parse(c.date))||new Date(c.date).toISOString().slice(0,10)!==c.date)throw Error('Choose a valid calendar date.');
 if(!Number.isFinite(c.budget)||c.budget<0||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end>1440||c.end-c.start<30)throw Error('Choose a valid budget and a time window of at least 30 minutes.');
 const ids=new Set<string>(),places=new Set<string>();let previous=-Infinity,total=0;
 for(const a of [...activities].sort((a,b)=>a.start-b.start)){
  if(ids.has(a.id)||places.has(a.placeId))throw Error('Each itinerary stop must be unique.');ids.add(a.id);places.add(a.placeId);
  if(a.start<c.start||a.end>c.end||a.end-a.start<30)throw Error('Activities must fit inside your time window.');
  const start=localToUtc(c.date,a.start,c.location.timezone),end=localToUtc(c.date,a.end,c.location.timezone);
  if(start<previous+1800000||end<=start)throw Error('Leave at least 30 minutes between stops.');previous=end;
  if(!Number.isFinite(a.budget)||a.budget<0)throw Error('Set a valid spending allowance.');total+=a.budget;
 }if(total>c.budget+0.001)throw Error('Your spending allowances exceed the day’s budget.');return total;
}
export function isOpen(p:Place,date:string,start:number,end:number){if(p.eventStart)return true;const periods=p.periods;if(!periods?.length)return true;const day=new Date(date+'T12:00:00Z').getUTCDay();return periods.some(period=>{const o=period.open,c=period.close;if(o.day===0&&o.hour===0&&!c)return true;if(!c)return false;const begin=o.day*1440+o.hour*60+o.minute;let finish=c.day*1440+c.hour*60+c.minute;if(finish<=begin)finish+=7*1440;const s=day*1440+start,e=day*1440+end;return (s>=begin&&e<=finish)||(s+10080>=begin&&e+10080<=finish)})}
export function generate(c:Constraints,places:Place[],preserved:Activity[]=[],preferred:string[]=[]){validate(c,preserved);const plan=[...preserved];let spent=plan.reduce((n,a)=>n+a.budget,0);const candidates=places.filter(p=>!plan.some(a=>a.placeId===p.id)&&(!c.rain||p.indoor!==false)).sort((a,b)=>score(b)-score(a));
 function score(p:Place){return (c.interests.includes(p.category)?20:0)+(preferred.includes(p.id)?40-preferred.indexOf(p.id):0)+(c.mood==='Easygoing'&&p.category==='Food & drink'?10:0)+(c.mood==='Adventurous'&&p.category==='Outdoors'?10:0)+(p.rating||0)}
 for(let cursor=c.start;cursor<c.end&&plan.length<5;cursor+=15){const p=candidates.find(p=>{const duration=p.duration;const s=localToUtc(c.date,cursor,c.location.timezone);return (!p.eventStart||Math.abs(p.eventStart-s)<60000)&&cursor+duration<=c.end&&isOpen(p,c.date,cursor,cursor+duration)&&!plan.some(a=>cursor<a.end+30&&cursor+duration+30>a.start)&&((p.priceMin!==null&&p.currency===c.currency)?p.priceMin:0)<=c.budget-spent});if(!p)continue;
 const budget=p.priceMin!==null&&p.currency===c.currency?p.priceMin:Math.floor((c.budget-spent)/Math.max(1,4-plan.length));plan.push({id:crypto.randomUUID(),placeId:p.id,start:cursor,end:cursor+p.duration,budget,pinned:false,shared:false,done:false});spent+=budget;candidates.splice(candidates.indexOf(p),1);cursor+=p.duration+15;
 }plan.sort((a,b)=>a.start-b.start);validate(c,plan);return plan;
}
