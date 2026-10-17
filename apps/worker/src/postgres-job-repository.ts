import type { Job } from '@moneyback/contracts';
import { validateClaimedJob, type ClaimedJob, type JobRepository } from './job-runner.js';

interface QueryResult<Row> { rows: Row[] }
interface DatabasePool { query<Row extends Record<string,unknown> = Record<string,unknown>>(sql:string,values?:unknown[]):Promise<QueryResult<Row>> }

export class PostgresJobRepository implements JobRepository {
  constructor(private readonly pool:DatabasePool){}
  async enqueue(input:{userId:string|null;idempotencyKey:string;jobType:Job['jobType'];payload:unknown;runAfter:Date;maxAttempts?:number}):Promise<string>{
    const result=await this.pool.query<{id:string}>(`INSERT INTO jobs(user_id,idempotency_key,job_type,payload,run_after,max_attempts)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id`,
      [input.userId,input.idempotencyKey,input.jobType,JSON.stringify(input.payload),input.runAfter,input.maxAttempts??5]);
    return result.rows[0].id;
  }
  async claim(now:Date):Promise<ClaimedJob|null>{
    const result=await this.pool.query<Record<string,unknown>>(`WITH selected AS (
      SELECT id FROM jobs WHERE status IN ('QUEUED','RETRYING') AND run_after <= $1 ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE jobs j SET status='RUNNING',locked_at=$1,attempts=attempts+1,updated_at=$1 FROM selected WHERE j.id=selected.id
      RETURNING j.id,j.user_id AS "userId",j.idempotency_key AS "idempotencyKey",j.attempts,j.max_attempts AS "maxAttempts",j.job_type AS "jobType",j.status,j.payload,j.created_at AS "createdAt",j.updated_at AS "updatedAt"`,[now]);
    return result.rows[0]?validateClaimedJob(result.rows[0]):null;
  }
  async succeed(id:string,result:unknown,now:Date){await this.pool.query("UPDATE jobs SET status='SUCCEEDED',result_json=$2,locked_at=NULL,updated_at=$3 WHERE id=$1 AND status='RUNNING'",[id,JSON.stringify(result),now]);}
  async retry(id:string,runAfter:Date,safeCode:string,now:Date){await this.pool.query("UPDATE jobs SET status='RETRYING',result_json=$2,run_after=$3,locked_at=NULL,updated_at=$4 WHERE id=$1 AND status='RUNNING'",[id,JSON.stringify({error:safeCode}),runAfter,now]);}
  async fail(id:string,safeCode:string,now:Date){await this.pool.query("UPDATE jobs SET status='FAILED',result_json=$2,locked_at=NULL,updated_at=$3 WHERE id=$1 AND status='RUNNING'",[id,JSON.stringify({error:safeCode}),now]);}
}

