/** MoneyBack OS canonical contracts — change ONLY via reviewed PR owned by Rishav. */
import { z } from 'zod';

// Database: snake_case. JSON API and TypeScript: camelCase. Currency: integer cents.
export const Id = z.string().min(1);
export const Cents = z.number().int().min(0).max(2147483647);
export const Currency = z.literal('USD'); // Extend via contract PR for multi-currency.
export const IsoDateTime = z.string().datetime({ offset: true });
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const TransactionSchema = z.object({
  id: Id, nessiePurchaseId: Id, accountId: Id, merchantId: Id.nullable(),
  merchantName: z.string().nullable(), amountCents: Cents, currency: Currency,
  occurredAt: IsoDateTime, receiptStatus: z.enum(['UNMATCHED','REVIEW','MATCHED'])
}).strict();

export const ReceiptSourceSchema = z.enum(['EMAIL','PHOTO','PDF','EXTENSION']);
export const ReceiptSchema = z.object({
  id: Id, source: ReceiptSourceSchema, merchantName: z.string().nullable(),
  orderNumber: z.string().nullable(), purchasedAt: IsoDateTime.nullable(),
  totalCents: Cents.nullable(), currency: Currency,
  originalFileId: Id, extractionStatus: z.enum(['PENDING','EXTRACTED','REVIEW','FAILED'])
}).strict();
export const ReceiptItemSchema = z.object({
  name: z.string().min(1), brand: z.string().nullable(), model: z.string().nullable(),
  sku: z.string().nullable(), gtin: z.string().nullable(), quantity: z.number().int().positive(),
  unitPriceCents: Cents.nullable()
}).strict();
export const ReceiptExtractionSchema = z.object({
  receipt: ReceiptSchema.omit({ id:true, originalFileId:true, extractionStatus:true }),
  items: z.array(ReceiptItemSchema), warningCodes: z.array(z.string())
}).strict();
export const PurchaseSchema = z.object({
  id: Id, transactionId: Id.nullable(), receiptIds: z.array(Id),
  merchantName: z.string(), orderNumber: z.string().nullable(),
  purchasedAt: IsoDateTime, amountCents: Cents, currency: Currency,
  matchStatus: z.enum(['UNMATCHED','REVIEW','MATCHED']),
  items: z.array(ReceiptItemSchema)
}).strict();
export const MatchCandidateSchema = z.object({
  transactionId: Id, receiptId: Id, score: z.number().min(0).max(100),
  matchedFields: z.array(z.enum(['MERCHANT','AMOUNT','DATE','REFERENCE'])),
  status: z.enum(['PROPOSED','CONFIRMED','REJECTED','REVIEW'])
}).strict();
export const ProductOfferSchema = z.object({
  id: Id, source: z.enum(['BEST_BUY','BRIGHT_DATA','SERPAPI','FIXTURE']), retailerName: z.string(),
  productName: z.string(), sku: z.string().nullable(), model: z.string().nullable(),
  gtin: z.string().nullable(), condition: z.enum(['NEW','OPEN_BOX','REFURBISHED','USED','UNKNOWN']),
  priceCents: Cents, shippingCents: Cents.nullable(), currency: Currency,
  inStock: z.boolean().nullable(), productUrl: HttpUrl, observedAt: IsoDateTime
}).strict();
export const OpportunitySchema = z.object({
  id: Id, purchaseId: Id, type: z.enum(['PRICE_DROP','MISSING_REFUND','OVERBILLING','SUBSCRIPTION_INCREASE','DEADLINE','WARRANTY']),
  estimatedSavingsCents: Cents.nullable(), currency: Currency,
  status: z.enum(['DETECTED','REVIEW','APPROVED','SUBMITTED','PENDING','CONFIRMED','REJECTED','EXPIRED']),
  eligibility: z.enum(['VERIFIED','REVIEW_REQUIRED','INELIGIBLE']),
  evidenceIds: z.array(Id), deadlineAt: IsoDateTime.nullable(), createdAt: IsoDateTime
}).strict();
export const RecoveryCaseSchema = z.object({
  id: Id, opportunityId: Id, status: OpportunitySchema.shape.status,
  expectedRefundCents: Cents.nullable(), confirmedRefundCents: Cents,
  matchingNessieDepositId: Id.nullable(), approvedAt: IsoDateTime.nullable(), updatedAt: IsoDateTime
}).strict();
export const NotificationSchema = z.object({
  id: Id, opportunityId: Id.nullable(), type: z.enum(['PRICE_DROP','REFUND','BILLING','RETURN_DEADLINE','WARRANTY','RENTAL','TEXTBOOK','GIFT_CARD']),
  title: z.string(), message: z.string(), createdAt: IsoDateTime, readAt: IsoDateTime.nullable()
}).strict();
export const ErrorSchema = z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string()}).strict()}).strict();
export const PageSchema = <T extends z.ZodTypeAny>(item:T) => z.object({data:z.array(item),nextCursor:z.string().nullable()}).strict();
export type Transaction = z.infer<typeof TransactionSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type Purchase = z.infer<typeof PurchaseSchema>;
export type ProductOffer = z.infer<typeof ProductOfferSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type RecoveryCase = z.infer<typeof RecoveryCaseSchema>;

export const CONTRACT_VERSION = '1.2.0' as const;
export const EvidenceSchema = z.object({
  id: Id, sourceType: z.enum(['RECEIPT', 'TRANSACTION', 'OFFER', 'POLICY', 'USER']),
  sourceId: Id, category: z.string().min(1), acquisitionMethod: z.string().min(1),
  rawUrl: HttpUrl.nullable(), checksum: z.string().nullable(), createdAt: IsoDateTime
}).strict();
export const PolicySchema = z.object({
  id: Id, purchaseId: Id.nullable(),
  policyType: z.enum(['WARRANTY', 'RETURN', 'RENTAL', 'TEXTBOOK', 'GIFTCARD', 'SUBSCRIPTION']),
  sourceName: z.string().min(1), sourceUrl: HttpUrl.nullable(), evidenceIds: z.array(Id).min(1),
  rawTerms: z.record(z.string(), z.unknown()), exclusions: z.array(z.string()),
  eligibility: z.enum(['VERIFIED', 'REVIEW_REQUIRED', 'INELIGIBLE']),
  parsedStartAt: IsoDateTime.nullable(), parsedEndAt: IsoDateTime.nullable()
}).strict();
export const RefundSchema = z.object({
  id: Id, caseId: Id, depositId: Id.nullable(), expectedAmountCents: Cents,
  confirmedAmountCents: Cents.nullable(),
  status: z.enum(['PENDING', 'MATCHED', 'REJECTED', 'CONFIRMED']),
  simulated: z.literal(true), evidenceIds: z.array(Id),
  expectedAt: IsoDateTime.nullable(), createdAt: IsoDateTime, updatedAt: IsoDateTime
}).strict().superRefine((refund, ctx) => {
  if ((refund.status === 'MATCHED' || refund.status === 'CONFIRMED') &&
      (!refund.depositId || refund.confirmedAmountCents === null || !refund.evidenceIds.length)) {
    ctx.addIssue({ code: 'custom', message: 'Matched refunds require a deposit, amount and evidence' });
  }
});
export const EventSchema = z.object({
  id: Id, entityType: z.string().min(1), entityId: Id.nullable(),
  eventType: z.string().min(1), eventPayload: z.record(z.string(), z.unknown()), createdAt: IsoDateTime
}).strict();
export const SubscriptionSchema = z.object({
  id: Id, accountId: Id.nullable(), merchantName: z.string().min(1), planName: z.string().nullable(),
  amountCents: Cents, currency: Currency, billingCycle: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'ONE_TIME']),
  startedAt: IsoDateTime, nextBillingAt: IsoDateTime.nullable()
}).strict();
export const DeadlineSchema = z.object({
  id: Id, purchaseId: Id, policyId: Id, type: z.enum(['RETURN', 'WARRANTY', 'RENTAL', 'TEXTBOOK', 'GIFT_CARD']),
  deadlineAt: IsoDateTime, evidenceIds: z.array(Id).min(1)
}).strict();
export const JobSchema = z.object({
  id: Id, jobType: z.enum(['NESSIE_IMPORT', 'PRICE_MONITOR', 'RECEIPT_MATCH', 'POLICY_SCAN', 'REFUND_RECONCILE']),
  status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING']),
  createdAt: IsoDateTime, updatedAt: IsoDateTime
}).strict();
export const ReceiptGroupSchema = z.object({ receiptIds: z.array(Id).min(1), canonicalReceiptId: Id }).strict();
export const BillingComparisonSchema = z.object({
  purchaseId: Id, differenceCents: Cents, evidenceIds: z.array(Id),
  eligibility: OpportunitySchema.shape.eligibility
}).strict();
export const ReceiptIngestRequestSchema = z.object({ source: ReceiptSourceSchema, originalFileId: Id }).strict();
export const ReceiptMatchRequestSchema = z.object({ receiptId: Id, transactionIds: z.array(Id).min(1) }).strict();
export const ReceiptConsolidateRequestSchema = z.object({ receiptIds: z.array(Id).min(2) }).strict();
export const PolicyExtractRequestSchema = z.object({ purchaseId: Id, evidenceIds: z.array(Id).min(1) }).strict();
export const BillingCompareRequestSchema = PolicyExtractRequestSchema;
export const RecoveryCaseRequestSchema = z.object({ opportunityId: Id }).strict();
export const ApprovalRequestSchema = z.object({ approved: z.literal(true) }).strict();
export const RefundReconcileRequestSchema = z.object({ caseId: Id, depositIds: z.array(Id) }).strict();
export const SyncRequestSchema = z.object({ accountId: Id }).strict();
export const MonitorRequestSchema = z.object({ purchaseIds: z.array(Id).min(1) }).strict();
export const HealthSchema = z.object({ status: z.literal('ok'), service: z.literal('moneyback-api') }).strict();
export const ResponseSchema = <T extends z.ZodType>(data: T) => z.object({ data }).strict();

/** Additive v1.1 private evidence upload; raw document bytes are never returned by GET. */
export const DocumentUploadRequestSchema = z.object({
  mimeType: z.enum(['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/html','application/json']),
  contentBase64: z.string().min(4).max(5592408).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
}).strict();
export const DocumentMetadataSchema = z.object({
  originalFileId: Id, evidenceId: Id, mimeType: DocumentUploadRequestSchema.shape.mimeType,
  byteLength: z.number().int().positive().max(4194304), checksum: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

/** Route registry refers to these runtime validators by name. */
export const HttpSchemas = {
  DocumentUploadRequest: DocumentUploadRequestSchema, DocumentResponse: ResponseSchema(DocumentMetadataSchema),
  Health: HealthSchema, PurchasePage: PageSchema(PurchaseSchema), EventPage: PageSchema(EventSchema),
  OfferPage: PageSchema(ProductOfferSchema), OpportunityPage: PageSchema(OpportunitySchema),
  SubscriptionPage: PageSchema(SubscriptionSchema), NotificationPage: PageSchema(NotificationSchema),
  DeadlinePage: PageSchema(DeadlineSchema), ReceiptResponse: ResponseSchema(ReceiptSchema),
  MatchResponse: ResponseSchema(z.array(MatchCandidateSchema)), ReceiptGroupResponse: ResponseSchema(ReceiptGroupSchema),
  PolicyResponse: ResponseSchema(PolicySchema), BillingResponse: ResponseSchema(BillingComparisonSchema),
  CaseResponse: ResponseSchema(RecoveryCaseSchema), RefundResponse: ResponseSchema(z.array(RefundSchema)),
  JobResponse: ResponseSchema(JobSchema), ReceiptIngestRequest: ReceiptIngestRequestSchema,
  ReceiptMatchRequest: ReceiptMatchRequestSchema, ReceiptConsolidateRequest: ReceiptConsolidateRequestSchema,
  PolicyExtractRequest: PolicyExtractRequestSchema, BillingCompareRequest: BillingCompareRequestSchema,
  RecoveryCaseRequest: RecoveryCaseRequestSchema, ApprovalRequest: ApprovalRequestSchema,
  RefundReconcileRequest: RefundReconcileRequestSchema, SyncRequest: SyncRequestSchema,
  MonitorRequest: MonitorRequestSchema, Error: ErrorSchema
} as const;

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Refund = z.infer<typeof RefundSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Deadline = z.infer<typeof DeadlineSchema>;
export type Job = z.infer<typeof JobSchema>;
