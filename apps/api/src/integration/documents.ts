import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { z } from 'zod';
import { ReceiptSchema, type Receipt, type ReceiptExtraction } from '@moneyback/contracts';
import type { DocumentStore } from '../modules/documents/extractor.js';
import { transaction, uuid } from './database.js';
import { ApiError } from './security.js';
const fileId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const originalSchema = z.object({ mimeType: z.string(), data: z.string().max(14 * 1024 * 1024) }).strict();
/** Administrator-provisioned private volume; never serves files over HTTP. */
export class PrivateDocumentStore implements DocumentStore {
  constructor(private readonly pool: pg.Pool, private readonly directory: string) {}
  private path(userId: string, originalFileId: string) {
    if (!fileId.safeParse(originalFileId).success) throw new ApiError('INVALID_FILE_ID', 400);
    return join(resolve(this.directory), uuid(userId), `${originalFileId}.json`);
  }
  async readOriginal(userId: string, originalFileId: string) {
    const path = this.path(userId, originalFileId);
    try {
      if ((await stat(path)).size > 15 * 1024 * 1024) throw new ApiError('DOCUMENT_TOO_LARGE', 413);
      const value = originalSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      return { bytes: Buffer.from(value.data, 'base64'), mimeType: value.mimeType };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async retainExtraction(userId: string, originalFileId: string, evidence: { model: string; checksum: string; rawText: string; createdAt: string }) {
    this.path(userId, originalFileId);
    const directory = join(resolve(this.directory), uuid(userId), 'extractions');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, `${randomUUID()}.json`), JSON.stringify({ originalFileId, ...evidence }), { flag: 'wx', mode: 0o600 });
  }
  async saveReceipt(userId: string, receipt: Receipt, extraction: ReceiptExtraction) {
    const original = await this.readOriginal(userId, receipt.originalFileId);
    if (!original) throw new ApiError('NOT_FOUND', 404);
    await transaction(this.pool, async client => {
      await client.query(`INSERT INTO receipts(id,user_id,source,merchant_name,order_number,purchased_at,total_cents,currency,original_file_id,extraction_status,raw_payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,'USD',$8,$9,$10)`, [receipt.id,userId,receipt.source,receipt.merchantName,receipt.orderNumber,receipt.purchasedAt,receipt.totalCents,receipt.originalFileId,receipt.extractionStatus,JSON.stringify(extraction)]);
      for (const item of extraction.items) await client.query(`INSERT INTO receipt_items(user_id,receipt_id,name,brand,model,sku,gtin,quantity,unit_price_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId,receipt.id,item.name,item.brand,item.model,item.sku,item.gtin,item.quantity,item.unitPriceCents]);
      await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,checksum) VALUES($1,'RECEIPT',$2,'PURCHASE_PROOF',$3,$4)`,
        [userId,receipt.id,receipt.source,createHash('sha256').update(original.bytes).digest('hex')]);
    });
  }
}
export function receiptFromRow(row: Record<string, unknown>): Receipt {
  const date = row.purchased_at;
  return ReceiptSchema.parse({ id: row.id, source: row.source, merchantName: row.merchant_name, orderNumber: row.order_number,
    purchasedAt: date instanceof Date ? date.toISOString() : date, totalCents: row.total_cents, currency: row.currency,
    originalFileId: row.original_file_id, extractionStatus: row.extraction_status });
}
