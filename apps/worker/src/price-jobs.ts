import { createHash } from 'node:crypto';
import type { Job } from '@moneyback/contracts';

export interface TriggerIdentity { userId:string; roles:readonly string[] }
export interface PriceJobQueue { enqueue(input:{userId:string|null;idempotencyKey:string;jobType:Job['jobType'];payload:unknown;runAfter:Date}):Promise<string> }

export function createManualPriceTrigger(queue:PriceJobQueue,now:()=>Date=()=>new Date()){
  return async(identity:TriggerIdentity|null,purchaseIds:string[]):Promise<string>=>{
    if(!identity||!identity.roles.some(role=>role==='admin'||role==='demo'))throw new Error('FORBIDDEN');
    const ids=[...new Set(purchaseIds.map(id=>id.trim()).filter(Boolean))].sort();
    if(!ids.length||ids.length>100)throw new Error('INVALID_PURCHASE_IDS');
    const key=`manual-price:${identity.userId}:${digest(ids.join(','))}`;
    return queue.enqueue({userId:identity.userId,idempotencyKey:key,jobType:'PRICE_MONITOR',payload:{purchaseIds:ids,trigger:'MANUAL'},runAfter:now()});
  };
}
export function createScheduledPriceEnqueuer(queue:PriceJobQueue,now:()=>Date=()=>new Date()){
  return async(userId:string,purchaseIds:string[]):Promise<string>=>{
    const instant=now(); const window=instant.toISOString().slice(0,13);
    const ids=[...new Set(purchaseIds)].sort();
    return queue.enqueue({userId,idempotencyKey:`scheduled-price:${userId}:${window}:${digest(ids.join(','))}`,
      jobType:'PRICE_MONITOR',payload:{purchaseIds:ids,trigger:'SCHEDULED'},runAfter:instant});
  };
}
function digest(value:string):string{return createHash('sha256').update(value).digest('hex').slice(0,24);}

