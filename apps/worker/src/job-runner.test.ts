import {describe,expect,test,vi} from 'vitest';
import {JobRunner,computeBackoffMs,type ClaimedJob,type JobRepository} from './job-runner.js';
import {createManualPriceTrigger,createScheduledPriceEnqueuer} from './price-jobs.js';
const job:ClaimedJob={id:'j',userId:'u',idempotencyKey:'key',attempts:1,maxAttempts:3,payload:{},jobType:'PRICE_MONITOR',status:'RUNNING',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z'};
function repo(overrides:Partial<JobRepository>={}):JobRepository{return{claim:vi.fn(async()=>job),succeed:vi.fn(async()=>{}),retry:vi.fn(async()=>{}),fail:vi.fn(async()=>{}),...overrides};}
describe('T19 job runner',()=>{
  test('succeeds once and records result',async()=>{const repository=repo();const handler=vi.fn(async()=>({offers:2}));
    expect(await new JobRunner(repository,{PRICE_MONITOR:handler},()=>new Date('2026-10-17T00:00:00Z')).runOnce()).toBe('SUCCEEDED');
    expect(repository.succeed).toHaveBeenCalledWith('j',{offers:2},expect.any(Date));});
  test('uses bounded exponential retry and safe errors',async()=>{const repository=repo();
    expect(await new JobRunner(repository,{PRICE_MONITOR:async()=>{throw new Error('secret https://bad')}},()=>new Date('2026-10-17T00:00:00Z')).runOnce()).toBe('RETRYING');
    expect(repository.retry).toHaveBeenCalledWith('j',new Date('2026-10-17T00:00:01Z'),'JOB_EXECUTION_FAILED',expect.any(Date));
    expect(computeBackoffMs(30)).toBe(900000);});
  test('fails after maximum attempts',async()=>{const repository=repo({claim:vi.fn(async()=>({...job,attempts:3}))});
    expect(await new JobRunner(repository,{PRICE_MONITOR:async()=>{throw new Error('UPSTREAM_TIMEOUT')} }).runOnce()).toBe('FAILED');
    expect(repository.fail).toHaveBeenCalledWith('j','UPSTREAM_TIMEOUT',expect.any(Date));});
});
test('manual trigger requires admin/demo identity and canonicalizes replay key',async()=>{const enqueue=vi.fn(async()=> 'job-id');const trigger=createManualPriceTrigger({enqueue},()=>new Date('2026-10-17T00:00:00Z'));
  await expect(trigger({userId:'u',roles:['user']},['p'])).rejects.toThrow('FORBIDDEN');
  await trigger({userId:'u',roles:['demo']},['b','a','a']); await trigger({userId:'u',roles:['demo']},['a','b']);
  expect(enqueue.mock.calls[0][0].idempotencyKey).toBe(enqueue.mock.calls[1][0].idempotencyKey);
});
test('scheduled trigger deduplicates the same tenant/hour/purchase set',async()=>{const enqueue=vi.fn(async()=> 'job-id');const schedule=createScheduledPriceEnqueuer({enqueue},()=>new Date('2026-10-17T12:34:00Z'));
  await schedule('u',['p']);await schedule('u',['p']);expect(enqueue.mock.calls[0][0].idempotencyKey).toBe(enqueue.mock.calls[1][0].idempotencyKey);
});
