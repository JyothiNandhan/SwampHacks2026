import { z } from 'zod';
import { JobSchema, type Job } from '@moneyback/contracts';

export interface ClaimedJob extends Job { userId: string | null; idempotencyKey: string; attempts: number; maxAttempts: number; payload: unknown }
export interface JobRepository {
  claim(now: Date): Promise<ClaimedJob | null>;
  succeed(id: string, result: unknown, now: Date): Promise<void>;
  retry(id: string, runAfter: Date, safeCode: string, now: Date): Promise<void>;
  fail(id: string, safeCode: string, now: Date): Promise<void>;
}
export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

export class JobRunner {
  constructor(private readonly repository: JobRepository, private readonly handlers: Partial<Record<Job['jobType'],JobHandler>>,
    private readonly now:()=>Date=()=>new Date()) {}
  async runOnce(): Promise<'IDLE'|'SUCCEEDED'|'RETRYING'|'FAILED'> {
    const job=await this.repository.claim(this.now());
    if(!job)return 'IDLE';
    const handler=this.handlers[job.jobType];
    if(!handler){await this.repository.fail(job.id,'HANDLER_NOT_CONFIGURED',this.now());return 'FAILED';}
    try{const result=await handler(job);await this.repository.succeed(job.id,result,this.now());return 'SUCCEEDED';}
    catch(error){
      const code=safeErrorCode(error);
      if(job.attempts>=job.maxAttempts){await this.repository.fail(job.id,code,this.now());return 'FAILED';}
      await this.repository.retry(job.id,new Date(this.now().valueOf()+computeBackoffMs(job.attempts)),code,this.now());return 'RETRYING';
    }
  }
}
export function computeBackoffMs(attempt:number):number{
  if(!Number.isInteger(attempt)||attempt<1)throw new Error('INVALID_ATTEMPT');
  return Math.min(15*60_000,1_000*2**Math.min(attempt-1,20));
}
function safeErrorCode(error:unknown):string{
  if(error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message))return error.message;
  return 'JOB_EXECUTION_FAILED';
}
const ClaimedJobSchema=JobSchema.extend({
  userId:z.uuid().nullable(),idempotencyKey:z.string().min(1),attempts:z.number().int().positive(),
  maxAttempts:z.number().int().positive(),payload:z.unknown()
});
export function validateClaimedJob(value:unknown):ClaimedJob{
  return ClaimedJobSchema.parse(value);
}
