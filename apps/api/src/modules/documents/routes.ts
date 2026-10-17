import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorSchema, HttpSchemas, type Receipt } from '@moneyback/contracts';
import { ExtractionError } from './extractor.js';

/** Register only after the server supplies token validation and user-scoped storage. */
export function registerDocumentsRoutes(app: FastifyInstance, options: {
  authenticate: (request: FastifyRequest) => Promise<string | null>;
  extractReceipt: (userId: string, receiptId: string, input: unknown) => Promise<Receipt>;
}) {
  app.post('/api/v1/receipts/ingest', async (request, reply) => {
    try {
      const userId = await options.authenticate(request);
      if (!userId) throw new ExtractionError('UNAUTHORIZED', 401);
      const input = HttpSchemas.ReceiptIngestRequest.safeParse(request.body);
      if (!input.success) throw new ExtractionError('INVALID_REQUEST', 400);
      const receipt = await options.extractReceipt(userId, randomUUID(), input.data);
      return HttpSchemas.ReceiptResponse.parse({ data: receipt });
    } catch (error) {
      const known = error instanceof ExtractionError;
      return reply.code(known ? error.statusCode : 500).send(ErrorSchema.parse({ error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.code : 'Receipt processing failed', requestId: request.id
      } }));
    }
  });
}
