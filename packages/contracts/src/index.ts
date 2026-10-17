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
  id: Id, source: z.enum(['BEST_BUY','BRIGHT_DATA','FIXTURE']), retailerName: z.string(),
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

