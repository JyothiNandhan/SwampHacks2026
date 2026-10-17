import { z } from 'zod';

export const Id = z.string().min(1);
export const Cents = z.number().int().nonnegative();
export const Currency = z.literal('USD');
export const IsoDateTime = z.string().datetime({ offset: true });

export const ProductOfferSchema = z.object({
  id: Id,
  source: z.enum(['BEST_BUY', 'BRIGHT_DATA', 'FIXTURE']),
  retailerName: z.string(),
  productName: z.string(),
  sku: z.string().nullable(),
  model: z.string().nullable(),
  gtin: z.string().nullable(),
  condition: z.enum(['NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'UNKNOWN']),
  priceCents: Cents,
  shippingCents: Cents.nullable(),
  currency: Currency,
  inStock: z.boolean().nullable(),
  productUrl: z.string().url(),
  observedAt: IsoDateTime
}).strict();

export type ProductOffer = z.infer<typeof ProductOfferSchema>;
