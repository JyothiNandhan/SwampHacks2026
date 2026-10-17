import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { HttpSchemas, CONTRACT_VERSION } from '@moneyback/contracts';
export const registry: { routes: { method: string; path: string; requestSchema?: keyof typeof HttpSchemas; responseSchema: keyof typeof HttpSchemas; security: string; prefix?: boolean }[] } = JSON.parse(readFileSync(new URL('../../../../config/api-contract.json', import.meta.url), 'utf8'));
export function openApiDocument() {
  const paths: Record<string, unknown> = {};
  for (const route of registry.routes) {
    const path = `${route.prefix === false ? '' : '/api/v1'}${route.path}`.replace(/:([A-Za-z]+)/g, '{$1}');
    const operation = {
      operationId: `${route.method.toLowerCase()}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
      security: route.security === 'public' ? [] : [{ bearerAuth: [] }],
      parameters: [...[...route.path.matchAll(/:([A-Za-z]+)/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' } })), ...(route.method==='GET'&&route.prefix!==false?[{name:'cursor',in:'query',required:false,schema:{type:'string',format:'uuid'}}]:[])],
      ...(route.requestSchema ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(HttpSchemas[route.requestSchema]) } } } } : {}),
      responses: { '200': { description: 'Success', content: { 'application/json': { schema: z.toJSONSchema(HttpSchemas[route.responseSchema]) } } },
        default: { description: 'Error', content: { 'application/json': { schema: z.toJSONSchema(HttpSchemas.Error) } } } }
    };
    paths[path] = { ...(paths[path] as object ?? {}), [route.method.toLowerCase()]: operation };
  }
  return { openapi: '3.1.0', info: { title: 'MoneyBack OS API', version: CONTRACT_VERSION },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Provisioned per-user opaque access token' } } }, paths };
}
