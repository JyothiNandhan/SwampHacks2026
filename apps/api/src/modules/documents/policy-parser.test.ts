import { describe, expect, test } from 'vitest';
import { parsePolicyDocument } from './policy-parser.js';

describe('T13 policy parser', () => {
  test('extracts explicit dates, exclusions, and cited raw evidence', () => {
    const result = parsePolicyDocument({ id: 'policy-1', evidenceId: 'evidence-1', purchaseId: 'purchase-1',
      purchasedAt: '2026-10-01T12:00:00.000Z', document: { sourceName: 'Retailer terms', sourceUrl: 'https://example.com/returns',
        acquiredAt: '2026-10-17T12:00:00Z', text: 'Items may be returned within 30 days. Final sale items are non-returnable.' } });
    expect(result.policy).toMatchObject({ policyType: 'RETURN', eligibility: 'VERIFIED', parsedEndAt: '2026-10-31T12:00:00.000Z' });
    expect(result.policy.exclusions).toHaveLength(1);
    expect(result.evidence.checksum).toHaveLength(64);
  });
  test('does not invent a deadline from ambiguous text', () => {
    const result = parsePolicyDocument({ id: 'p', evidenceId: 'e', purchaseId: null, purchasedAt: null,
      document: { sourceName: 'Terms', sourceUrl: null, acquiredAt: '2026-10-17T12:00:00Z', text: 'Returns may be accepted. Contact us.' } });
    expect(result.policy).toMatchObject({ eligibility: 'REVIEW_REQUIRED', parsedEndAt: null });
    expect(result.warningCodes).toContain('POLICY_END_DATE_AMBIGUOUS');
  });
  test('parses an explicit gift-card expiration while retaining conservative evidence metadata',()=>{
    const result=parsePolicyDocument({id:'gift',evidenceId:'gift-e',purchaseId:'purchase',purchasedAt:'2026-10-01T00:00:00Z',document:{sourceName:'Gift terms',sourceUrl:null,
      acquiredAt:'2026-10-17T00:00:00Z',text:'Gift card expires on 2027-01-31.'}});
    expect(result.policy).toMatchObject({policyType:'GIFTCARD',eligibility:'VERIFIED',parsedEndAt:'2027-01-31T23:59:59.000Z',rawTerms:{retentionCategory:'KEEP_DIGITAL'}});
  });
});
