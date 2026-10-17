import type { Evidence, Purchase, RecoveryCase } from '@moneyback/contracts';
import { detectSubscriptionPriceChange } from '../modules/banking/subscription-monitor.js';
import { compareRentalBill } from '../modules/documents/billing-comparison.js';
import { parsePolicyDocument } from '../modules/documents/policy-parser.js';
import { createPurchaseIntegrator } from '../modules/matching/purchase-integration.js';
import { createApprovalArtifacts, createRecoveryRecommendation } from '../modules/recovery/recommendation.js';
import { reconcileRefund, summarizeRefunds } from '../modules/recovery/refund-reconciliation.js';
import { transitionRecoveryCase } from '../modules/recovery/state-machine.js';
import { createPolicyTimeline } from '../modules/recovery/timeline.js';
import { buildPriceDropOpportunity } from '../modules/retail/price-monitor.js';

export interface Gate2ExampleResult {
  purchaseStatus: Purchase['matchStatus'];
  policyEligibility: 'VERIFIED'|'REVIEW_REQUIRED'|'INELIGIBLE';
  deadlineType: string;
  savingsCents: number;
  recommendation: string;
  approvedStatus: string;
  refundState: string;
  subscriptionIncreaseCents: number;
  rentalDifferenceCents: number;
}

/** Deterministic, credential-free example of the Gate 2 hand-offs. */
export async function runGate2Example():Promise<Gate2ExampleResult>{
  const now='2026-10-17T12:30:00.000Z';
  const receipt={id:'receipt-demo',source:'EMAIL' as const,merchantName:'Best Buy',orderNumber:'BB-42',purchasedAt:'2026-10-01T12:00:00.000Z',
    totalCents:100000,currency:'USD' as const,originalFileId:'private-file-demo',extractionStatus:'EXTRACTED' as const};
  const transaction={id:'transaction-demo',nessiePurchaseId:'nessie-demo',accountId:'account-demo',merchantId:'merchant-demo',merchantName:'Best Buy',
    amountCents:100000,currency:'USD' as const,occurredAt:'2026-10-01T13:00:00.000Z',receiptStatus:'UNMATCHED' as const};
  const item={name:'Demo Laptop',brand:'Acme',model:'MODEL-42',sku:'SKU-42',gtin:null,quantity:1,unitPriceCents:100000};
  const receiptEvidence:Evidence={id:'evidence-receipt',sourceType:'RECEIPT',sourceId:receipt.id,category:'PURCHASE_PROOF',acquisitionMethod:'EMAIL',rawUrl:null,checksum:'fixture-checksum',createdAt:now};
  const integrate=createPurchaseIntegrator({async save(input){return{id:'purchase-demo',transactionId:input.transaction.id,receiptIds:[input.receipt.id],
    merchantName:input.receipt.merchantName!,orderNumber:input.receipt.orderNumber,purchasedAt:input.receipt.purchasedAt!,amountCents:input.receipt.totalCents!,
    currency:'USD',matchStatus:input.matchStatus,items:input.items};}});
  const purchase=await integrate({userId:'user-demo',receipt,transactions:[transaction],items:[item],evidence:[receiptEvidence],transactionReferences:{'transaction-demo':'BB-42'}});
  if(!purchase)throw new Error('EXAMPLE_PURCHASE_NOT_MATCHED');

  const parsed=parsePolicyDocument({id:'policy-demo',evidenceId:'evidence-policy',purchaseId:purchase.id,purchasedAt:purchase.purchasedAt,
    document:{sourceName:'Best Buy demo terms',sourceUrl:'https://www.bestbuy.com/returns',acquiredAt:now,
      text:'Products may be returned within 30 days. Final sale items are non-returnable.'}});
  const timeline=createPolicyTimeline({purchaseId:purchase.id,policy:parsed.policy,ids:{deadlineId:'deadline-demo',eventId:'event-deadline',notificationId:'notification-deadline'},now});
  if(!timeline)throw new Error('EXAMPLE_TIMELINE_NOT_CREATED');

  const offer={id:'offer-demo',source:'FIXTURE' as const,retailerName:'Best Buy',productName:'Demo Laptop',sku:'SKU-42',model:'MODEL-42',gtin:null,
    condition:'NEW' as const,priceCents:85000,shippingCents:1000,currency:'USD' as const,inStock:true,productUrl:'https://www.bestbuy.com/site/demo',observedAt:'2026-10-17T12:00:00.000Z'};
  const opportunity=buildPriceDropOpportunity({id:'opportunity-demo',purchase,item,offer,evidenceIds:[receiptEvidence.id,parsed.evidence.id],maximumAgeMs:3_600_000,now,deadlineAt:parsed.policy.parsedEndAt});
  if(!opportunity)throw new Error('EXAMPLE_OPPORTUNITY_NOT_CREATED');
  const eligibleOpportunity={...opportunity,eligibility:'VERIFIED' as const};
  const recommendation=createRecoveryRecommendation(eligibleOpportunity,[receiptEvidence,parsed.evidence]);
  let recoveryCase:RecoveryCase={id:'case-demo',opportunityId:opportunity.id,status:'DETECTED',expectedRefundCents:opportunity.estimatedSavingsCents,
    confirmedRefundCents:0,matchingNessieDepositId:null,approvedAt:null,updatedAt:now};
  recoveryCase=transitionRecoveryCase(recoveryCase,'REVIEW',{actor:'SYSTEM',occurredAt:'2026-10-17T12:31:00.000Z'});
  recoveryCase=transitionRecoveryCase(recoveryCase,'APPROVED',{actor:'USER',explicitApproval:true,occurredAt:'2026-10-17T12:32:00.000Z'});
  createApprovalArtifacts(recoveryCase,eligibleOpportunity,{eventId:'event-approval',notificationId:'notification-approval'},'2026-10-17T12:32:00.000Z');
  const refunds=reconcileRefund({recoveryCase:{...recoveryCase,status:'PENDING'},expectation:{id:'refund-demo',caseId:recoveryCase.id,
    expectedAmountCents:14000,expectedAt:'2026-10-24T12:00:00.000Z',merchantName:'Best Buy',reference:'RMA-42',createdAt:now,evidenceIds:[parsed.evidence.id]},
    deposits:[{id:'deposit-demo',amountCents:14000,occurredAt:'2026-10-24T10:00:00.000Z',reference:'Best Buy refund RMA-42',simulated:true,evidenceId:'evidence-deposit'}],now:'2026-10-24T12:30:00.000Z'});
  const subscription=detectSubscriptionPriceChange({id:'subscription-demo',accountId:'account-demo',merchantName:'Stream Co',planName:'Plus',amountCents:1299,currency:'USD',billingCycle:'MONTHLY',startedAt:'2026-08-01T00:00:00.000Z',nextBillingAt:null},[
    {id:'bill-1',merchantName:'Stream Co',planName:'Plus',amountCents:999,occurredAt:'2026-09-01T00:00:00.000Z',recurring:true},
    {id:'bill-2',merchantName:'Stream Co',planName:'Plus',amountCents:1299,occurredAt:'2026-10-01T00:00:00.000Z',recurring:true}]);
  if(!subscription)throw new Error('EXAMPLE_SUBSCRIPTION_CHANGE_NOT_FOUND');
  const rental=compareRentalBill({purchaseId:purchase.id,evidence:[parsed.evidence],agreement:[{label:'Daily rate',amountCents:10000,evidenceId:parsed.evidence.id}],
    finalBill:[{label:'Daily rate',amountCents:12000,evidenceId:parsed.evidence.id}]});
  return{purchaseStatus:purchase.matchStatus,policyEligibility:parsed.policy.eligibility,deadlineType:timeline.deadline.type,
    savingsCents:opportunity.estimatedSavingsCents!,recommendation:recommendation.decision,approvedStatus:recoveryCase.status,
    refundState:summarizeRefunds(14000,refunds).state,subscriptionIncreaseCents:subscription.increaseCents,rentalDifferenceCents:rental.comparison.differenceCents};
}
