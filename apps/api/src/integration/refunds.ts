import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { RecoveryCaseSchema, RefundSchema, type Refund } from '@moneyback/contracts';
import { transaction, owned, wire } from './database.js';
import { ApiError } from './security.js';

/** Serializes deposit allocation; neither caller amounts nor equal-value deposits establish a refund. */
export async function reconcileImportedDeposits(pool: pg.Pool, userId: string, caseId: string, depositIds: string[], now = new Date()): Promise<Refund[]> {
  return transaction(pool, async client => {
    // Serializes across cases for this user, including competing deposits and replays.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`refund:${userId}`]);
    const row = await owned(client, 'cases', userId, caseId, true);
    const recoveryCase = RecoveryCaseSchema.parse(wire({ id:row.id,opportunity_id:row.opportunity_id,status:row.status,expected_refund_cents:row.expected_refund_cents,
      confirmed_refund_cents:row.confirmed_refund_cents,matching_nessie_deposit_id:row.matching_nessie_deposit_id,approved_at:row.approved_at,updated_at:row.updated_at }));
    if (!['PENDING', 'CONFIRMED'].includes(recoveryCase.status) || !recoveryCase.approvedAt) throw new ApiError('CASE_NOT_PENDING', 409);
    const opportunity = await owned(client, 'opportunities', userId, recoveryCase.opportunityId);
    const purchase = await owned(client, 'purchases', userId, String(opportunity.purchase_id));
    const expectation = (await client.query(`SELECT * FROM events WHERE user_id=$1 AND entity_id=$2 AND event_type='REFUND_EXPECTATION_RECORDED' ORDER BY created_at DESC LIMIT 1`, [userId,caseId])).rows[0];
    // Only a staff-provisioned audit event can supply the merchant refund reference.
    const reference = expectation?.event_payload?.reference;
    const accountId = expectation?.event_payload?.accountId;
    if (typeof reference !== 'string' || reference.trim().length < 6 || typeof accountId !== 'string') throw new ApiError('REFUND_EXPECTATION_REQUIRED', 409);
    const normalized = reference.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (normalized.length < 6) throw new ApiError('REFUND_EXPECTATION_REQUIRED', 409);
    if (recoveryCase.expectedRefundCents === null || recoveryCase.expectedRefundCents <= 0) throw new ApiError('REFUND_EXPECTATION_REQUIRED', 409);
    for (const depositId of [...new Set(depositIds)]) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(depositId)) throw new ApiError('INVALID_DEPOSIT_ID', 400);
      const deposit = (await client.query(`SELECT * FROM deposits WHERE user_id=$1 AND nessie_deposit_id=$2 FOR UPDATE`, [userId,depositId])).rows[0];
      if (!deposit) throw new ApiError('NOT_FOUND', 404);
      const settled=(await client.query(`SELECT e.event_payload FROM events e JOIN events current_import
        ON current_import.user_id=e.user_id AND current_import.idempotency_key='nessie:customer:'||(e.event_payload->>'customerId')
        AND current_import.event_payload->>'importId'=e.event_payload->>'importId'
        WHERE e.user_id=$1 AND e.event_type='NESSIE_DEPOSIT_IMPORTED_COMPLETED' AND e.event_payload->>'depositId'=$2
        ORDER BY e.created_at DESC LIMIT 1`,[userId,depositId])).rows[0];
      if (!settled || settled.event_payload.amountCents !== deposit.amount_cents || !deposit.simulated || deposit.account_id !== accountId || !deposit.reference ||
          new Date(deposit.occurred_at).valueOf() < Math.max(new Date(purchase.purchased_at as string | Date).valueOf(), Date.parse(recoveryCase.approvedAt)) ||
          new Date(deposit.occurred_at).valueOf() > now.valueOf() ||
          !String(deposit.reference).replace(/[^a-z0-9]/gi, '').toLowerCase().includes(normalized)) continue;
      const prior = (await client.query('SELECT case_id FROM refunds WHERE user_id=$1 AND deposit_id=$2', [userId,depositId])).rows[0];
      if (prior) { if (prior.case_id !== caseId) throw new ApiError('DEPOSIT_ALREADY_ALLOCATED', 409); continue; }
      const total = (await client.query(`SELECT COALESCE(SUM(confirmed_amount_cents),0)::int total FROM refunds WHERE user_id=$1 AND case_id=$2 AND status IN ('MATCHED','CONFIRMED')`, [userId,caseId])).rows[0].total;
      if (deposit.amount_cents <= 0 || total + deposit.amount_cents > recoveryCase.expectedRefundCents) continue;
      const evidenceId = randomUUID();
      const evidence = await client.query(`INSERT INTO evidence(id,user_id,source_type,source_id,category,acquisition_method) VALUES($1,$2,'TRANSACTION',$3,'SIMULATED_DEPOSIT','NESSIE_IMPORT') ON CONFLICT(user_id,source_type,source_id) DO UPDATE SET category=EXCLUDED.category RETURNING id`, [evidenceId,userId,`deposit:${depositId}`]);
      const refundId = randomUUID();
      await client.query(`INSERT INTO refunds(id,user_id,case_id,deposit_id,expected_amount_cents,confirmed_amount_cents,status,simulated) VALUES($1,$2,$3,$4,$5,$6,'MATCHED',TRUE)`, [refundId,userId,caseId,depositId,recoveryCase.expectedRefundCents,deposit.amount_cents]);
      await client.query('INSERT INTO refund_evidence(user_id,refund_id,evidence_id) VALUES($1,$2,$3)', [userId,refundId,evidence.rows[0].id]);
    }
    const rows = (await client.query(`SELECT r.*, COALESCE((SELECT json_agg(evidence_id) FROM refund_evidence e WHERE e.user_id=r.user_id AND e.refund_id=r.id),'[]') evidence_ids FROM refunds r WHERE user_id=$1 AND case_id=$2 ORDER BY r.id`, [userId,caseId])).rows;
    const refunds = rows.map(row => RefundSchema.parse(wire({ id:row.id,case_id:row.case_id,deposit_id:row.deposit_id,expected_amount_cents:row.expected_amount_cents,confirmed_amount_cents:row.confirmed_amount_cents,status:row.status,simulated:row.simulated,evidence_ids:row.evidence_ids,expected_at:row.expected_at,created_at:row.created_at,updated_at:row.updated_at })));
    const total = refunds.reduce((sum, refund) => sum + (refund.confirmedAmountCents ?? 0), 0);
    if (total === recoveryCase.expectedRefundCents && refunds.length) {
      await client.query(`UPDATE cases SET status='CONFIRMED',confirmed_refund_cents=$3,matching_nessie_deposit_id=$4,updated_at=$5 WHERE user_id=$1 AND id=$2`, [userId,caseId,total,refunds.length === 1 ? refunds[0].depositId : null,now]);
      await client.query(`UPDATE refunds SET status='CONFIRMED',updated_at=$3 WHERE user_id=$1 AND case_id=$2`, [userId,caseId,now]);
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'CASE',$3,'SIMULATED_REFUND_CONFIRMED',$4) ON CONFLICT DO NOTHING`, [userId,`refund-confirmed:${caseId}`,caseId,JSON.stringify({ simulated:true,confirmedRefundCents:total })]);
      return refunds.map(refund => ({ ...refund, status:'CONFIRMED', updatedAt:now.toISOString() }));
    }
    await client.query('UPDATE cases SET confirmed_refund_cents=$3,updated_at=$4 WHERE user_id=$1 AND id=$2', [userId,caseId,total,now]);
    return refunds;
  });
}
