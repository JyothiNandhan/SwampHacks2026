import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';
import { createReceiptExtractor, createGeminiGenerator, type DocumentStore } from './extractor.js';
import { registerDocumentsRoutes } from './routes.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/photo-response.json', import.meta.url), 'utf8'));
function setup(source = 'PHOTO', value: unknown = fixture) {
  const bytes = source === 'EMAIL'
    ? readFileSync(new URL('./fixtures/email.txt', import.meta.url)) : Buffer.from('synthetic mocked image');
  const store: DocumentStore = {
    readOriginal: vi.fn().mockResolvedValue({ bytes, mimeType: source === 'EMAIL' ? 'text/plain' : 'image/jpeg' }),
    retainExtraction: vi.fn().mockResolvedValue(undefined), saveReceipt: vi.fn().mockResolvedValue(undefined)
  };
  const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(value), candidates: [{ finishReason: 'STOP' }] });
  const extract = createReceiptExtractor({ store, generate, model: 'fixture-model' });
  return { store, generate, extract, bytes, input: { source, originalFileId: 'original-1' } };
}

describe('receipt extraction', () => {
  test.each(['PHOTO', 'EMAIL'])('extracts %s, retains raw evidence and validates cents/model', async source => {
    const value = structuredClone(fixture); value.receipt.source = source;
    const s = setup(source, value);
    expect(await s.extract('user-1', 'receipt-1', s.input)).toMatchObject({ totalCents: 30000, extractionStatus: 'EXTRACTED' });
    expect(s.store.readOriginal).toHaveBeenCalledWith('user-1', 'original-1');
    expect(s.store.retainExtraction).toHaveBeenCalledWith('user-1', 'original-1', expect.objectContaining({
      rawText: JSON.stringify(value), checksum: createHash('sha256').update(s.bytes).digest('hex')
    }));
    expect(s.store.saveReceipt).toHaveBeenCalledWith('user-1', expect.anything(), expect.objectContaining({ items: [expect.objectContaining({ model: 'DW-1', unitPriceCents: 30000 })] }));
    const part = s.generate.mock.calls[0][0].contents[0].parts[0];
    expect(source === 'EMAIL' ? part.text : part.inlineData.data).toBe(source === 'EMAIL' ? s.bytes.toString() : s.bytes.toString('base64'));
  });
  test('incomplete or non-receipt output requires review without inventing values', async () => {
    const value = structuredClone(fixture);
    Object.assign(value.receipt, { merchantName: null, purchasedAt: null, totalCents: null }); value.items = [];
    const s = setup('PHOTO', value);
    expect(await s.extract('u', 'r', s.input)).toMatchObject({ extractionStatus: 'REVIEW', totalCents: null });
    expect(s.store.saveReceipt).toHaveBeenCalledWith('u', expect.anything(), expect.objectContaining({ warningCodes: expect.arrayContaining(['DATE_UNKNOWN', 'TOTAL_UNKNOWN', 'ITEMS_UNKNOWN']) }));
  });
  test.each([300.25, -1, 2147483648])('rejects invalid cents %s and retains response', async totalCents => {
    const value = structuredClone(fixture); value.receipt.totalCents = totalCents;
    const s = setup('PHOTO', value);
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ code: 'INVALID_EXTRACTION' });
    expect(s.store.retainExtraction).toHaveBeenCalled(); expect(s.store.saveReceipt).not.toHaveBeenCalled();
  });
  test.each(['not JSON', '', JSON.stringify({ ...fixture, unexpected: true })])('rejects malformed/empty/extra-field responses', async text => {
    const s = setup(); s.generate.mockResolvedValue({ text });
    await expect(s.extract('u', 'r', s.input)).rejects.toBeDefined();
    expect(s.store.retainExtraction).toHaveBeenCalled(); expect(s.store.saveReceipt).not.toHaveBeenCalled();
  });
  test('rejects source mismatch and truncated output', async () => {
    const s = setup('EMAIL');
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ code: 'INVALID_EXTRACTION' });
    s.generate.mockResolvedValue({ text: JSON.stringify(fixture), candidates: [{ finishReason: 'MAX_TOKENS' }] });
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ code: 'EXTRACTION_INCOMPLETE' });
  });
  test('provider errors are sanitized', async () => {
    const s = setup(); s.generate.mockRejectedValue(new Error('secret receipt api-key'));
    await expect(s.extract('u', 'r', s.input)).rejects.toThrow('EXTRACTION_PROVIDER_FAILED');
    expect(s.store.saveReceipt).not.toHaveBeenCalled();
    expect(() => createGeminiGenerator('')).toThrow('GEMINI_NOT_CONFIGURED');
  });
  test('missing document, invalid MIME/size and unsupported sources do not reach Gemini', async () => {
    const s = setup();
    await expect(s.extract('u', 'r', { ...s.input, source: 'EXTENSION' })).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(s.store.readOriginal).mockResolvedValue(null);
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(s.store.readOriginal).mockResolvedValue({ bytes: Buffer.from('x'), mimeType: 'text/plain' });
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ statusCode: 415 });
    vi.mocked(s.store.readOriginal).mockResolvedValue({ bytes: Buffer.alloc(0), mimeType: 'image/jpeg' });
    await expect(s.extract('u', 'r', s.input)).rejects.toMatchObject({ statusCode: 413 });
    expect(s.generate).not.toHaveBeenCalled();
  });
  test('storage failure prevents success', async () => {
    const s = setup(); vi.mocked(s.store.retainExtraction).mockRejectedValue(new Error('storage failed'));
    await expect(s.extract('u', 'r', s.input)).rejects.toThrow('storage failed');
    expect(s.store.saveReceipt).not.toHaveBeenCalled();
  });
});

test('module route requires authentication and returns canonical response/error shapes', async () => {
  const app = Fastify(); const s = setup(); const authenticate = vi.fn().mockResolvedValue(null);
  registerDocumentsRoutes(app, { authenticate, extractReceipt: s.extract });
  try {
    const call = (payload: unknown) => app.inject({ method: 'POST', url: '/api/v1/receipts/ingest', payload });
    expect((await call(s.input)).statusCode).toBe(401); expect(s.generate).not.toHaveBeenCalled();
    authenticate.mockResolvedValue('user-1');
    expect((await call({ source: 'PHOTO' })).statusCode).toBe(400);
    const result = await call(s.input);
    expect(result.statusCode).toBe(200); expect(result.json().data.totalCents).toBe(30000);
    s.generate.mockRejectedValue(new Error('private secret'));
    const failed = await call(s.input);
    expect(failed.statusCode).toBe(502); expect(failed.body).not.toContain('private secret');
    expect(failed.json().error.requestId).toBeTruthy();
  } finally { await app.close(); }
});
