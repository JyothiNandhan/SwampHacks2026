import type pg from 'pg';
import { PostgresJobRepository } from './postgres-job-repository.js';
import { createScheduledPriceEnqueuer } from './price-jobs.js';
/** Enable explicitly after provider credentials and user monitoring consent are configured. */
export async function enqueueScheduledPrices(pool:pg.Pool,now=()=>new Date()):Promise<number>{
  const rows=(await pool.query<{user_id:string;id:string}>(`SELECT p.user_id,p.id FROM purchases p WHERE p.match_status='MATCHED'
    AND EXISTS(SELECT 1 FROM events e WHERE e.user_id=p.user_id AND e.entity_id=p.id AND e.event_type='PRICE_MONITORING_ENABLED')
    AND NOT EXISTS(SELECT 1 FROM events e WHERE e.user_id=p.user_id AND e.entity_id=p.id AND e.event_type='PRICE_MONITORING_DISABLED' AND e.created_at>(SELECT MAX(created_at) FROM events x WHERE x.user_id=p.user_id AND x.entity_id=p.id AND x.event_type='PRICE_MONITORING_ENABLED'))
    ORDER BY p.user_id,p.id LIMIT 1000`)).rows;
  const enqueue=createScheduledPriceEnqueuer(new PostgresJobRepository(pool),now);
  for(const row of rows)await enqueue(row.user_id,[row.id]);
  return rows.length;
}
