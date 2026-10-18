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
  const gmailRoutes:[string,string,z.ZodType,z.ZodType?][]=[
    ['get','',z.object({data:z.object({configured:z.boolean(),connected:z.boolean(),lastSyncAt:z.string().nullable()})})],
    ['delete','',z.object({data:z.object({connected:z.literal(false)})})],
    ['post','/connect',z.object({data:z.object({authorizationUrl:z.url()})})],
    ['post','/callback',z.object({data:z.object({connected:z.literal(true)})}),z.object({code:z.string().min(1).max(4096),state:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict()],
    ['post','/import',z.object({data:z.object({imported:z.number().int(),failed:z.number().int(),hasMore:z.boolean(),errorCode:z.string().optional()})})]
  ];
  for(const [method,suffix,response,body] of gmailRoutes){
    const path='/api/v1/email/gmail'+suffix;
    paths[path]={...(paths[path] as object??{}),[method]:{
      operationId:`${method}_gmail${suffix.replaceAll('/','_')}`,security:[{bearerAuth:[]}],
      ...(body?{requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(body)}}}}:{}),
      responses:{'200':{description:'Success',content:{'application/json':{schema:z.toJSONSchema(response)}}},default:{description:'Error',content:{'application/json':{schema:z.toJSONSchema(HttpSchemas.Error)}}}}
    }};
  }
  return { openapi: '3.1.0', info: { title: 'MoneyBack OS API', version: CONTRACT_VERSION },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Provisioned per-user opaque access token or RS256 Auth0 API access token with the configured issuer and audience' } } }, paths };
}
