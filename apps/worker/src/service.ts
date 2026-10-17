import { enqueueScheduledPrices } from './scheduler.js';
import pg from 'pg';
import { z } from 'zod';
import { JobRunner, type ClaimedJob } from './job-runner.js';
import { PostgresJobRepository } from './postgres-job-repository.js';

const configSchema=z.object({DATABASE_URL:z.string().url(),INTERNAL_API_URL:z.string().url(),INTERNAL_WORKER_TOKEN:z.string().regex(/^[A-Za-z0-9._~-]{32,512}$/),WORKER_SCHEDULE_ENABLED:z.enum(['true','false']).default('false'),WORKER_POLL_MS:z.coerce.number().int().min(100).max(60000).default(2000)});

export function createInternalPriceHandler(options:{url:string;token:string;fetchImpl?:typeof fetch}): (job:ClaimedJob)=>Promise<unknown>{
  const endpoint=new URL('/api/v1/internal/monitoring/prices/execute',options.url);
  if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw new Error('INVALID_INTERNAL_API_URL');
  return async job=>{
    const response=await (options.fetchImpl??fetch)(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),
      headers:{authorization:`Bearer ${options.token}`,'content-type':'application/json','x-idempotency-key':job.idempotencyKey},body:JSON.stringify({jobId:job.id})});
    if(!response.ok){await response.body?.cancel().catch(()=>undefined);throw new Error(response.status===429?'UPSTREAM_RATE_LIMITED':response.status>=500?'UPSTREAM_UNAVAILABLE':'UPSTREAM_REJECTED');}
    try{return await response.json();}catch{throw new Error('UPSTREAM_INVALID_RESPONSE');}
  };
}

export async function runWorker(env:NodeJS.ProcessEnv=process.env):Promise<never>{
  const parsed=configSchema.safeParse(env);if(!parsed.success)throw new Error(`Invalid worker configuration: ${[...new Set(parsed.error.issues.map(i=>i.path.join('.')))].join(', ')}`);
  const pool=new pg.Pool({connectionString:parsed.data.DATABASE_URL,max:4,connectionTimeoutMillis:10000,statement_timeout:30000});
  const repository=new PostgresJobRepository(pool);
  const runner=new JobRunner(repository,{PRICE_MONITOR:createInternalPriceHandler({url:parsed.data.INTERNAL_API_URL,token:parsed.data.INTERNAL_WORKER_TOKEN})});
  const stop=()=>pool.end().finally(()=>process.exit(0));process.once('SIGTERM',stop);process.once('SIGINT',stop);
  let nextScheduleAt=0;
  for(;;){if(parsed.data.WORKER_SCHEDULE_ENABLED==='true'&&Date.now()>=nextScheduleAt){await enqueueScheduledPrices(pool);nextScheduleAt=Date.now()+60_000;}const result=await runner.runOnce();if(result==='IDLE')await new Promise(resolve=>setTimeout(resolve,parsed.data.WORKER_POLL_MS));}
}

if(import.meta.url===`file://${process.argv[1]}`)runWorker().catch(()=>{process.stderr.write('Worker failed to start\n');process.exit(1);});
