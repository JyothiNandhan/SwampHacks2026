import { ConfigurationError } from '../configuration-error.js';
import { z } from 'zod';
import { credentialSchema } from './security.js';
const optional = z.preprocess(v => v === '' ? undefined : v, z.string().trim().min(1).optional());
const schema = z.object({
  API_TOKENS_JSON: z.string().default('[]').transform((value, ctx) => {
    try { return JSON.parse(value) as unknown; } catch { ctx.addIssue({ code: 'custom', message: 'Invalid token configuration' }); return z.NEVER; }
  }).pipe(z.array(credentialSchema).max(100)).superRefine((entries, ctx) => {
    if (new Set(entries.map(e => e.tokenHash)).size !== entries.length) ctx.addIssue({ code: 'custom', message: 'Duplicate tokens' });
  }),
  INTERNAL_WORKER_TOKEN: z.preprocess(v => v === '' ? undefined : v, z.string().regex(/^[A-Za-z0-9._~-]{32,512}$/).optional()),
  EVIDENCE_DIRECTORY: optional, GEMINI_API_KEY: optional, GEMINI_MODEL: optional,
  AUTH0_ISSUER: z.preprocess(v => v === '' ? undefined : v, z.url({protocol: /^https$/}).optional()),
  AUTH0_AUDIENCE: optional,
  GOOGLE_CLIENT_ID: optional, GOOGLE_CLIENT_SECRET: optional,
  GMAIL_REDIRECT_URI: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
  EMAIL_TOKEN_ENCRYPTION_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().regex(/^[a-fA-F0-9]{64}$/).optional()),
  SERPAPI_API_KEY: optional, BRIGHTDATA_API_KEY: optional,
  BRIGHTDATA_AMAZON_DATASET_ID: optional, BRIGHTDATA_WALMART_DATASET_ID: optional,
  PRICE_MONITOR_MODE: z.enum(['LIVE', 'REPLAY']).default('LIVE')
}).superRefine((env, ctx) => {
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) ctx.addIssue({ code: 'custom', path: ['GEMINI_MODEL'], message: 'Required when enabled' });
  if (!!env.AUTH0_ISSUER !== !!env.AUTH0_AUDIENCE) ctx.addIssue({code:'custom',path:['AUTH0_ISSUER'],message:'Issuer and audience must be configured together'});
  if (env.AUTH0_ISSUER) {
    const url = new URL(env.AUTH0_ISSUER);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') ctx.addIssue({code:'custom',path:['AUTH0_ISSUER'],message:'Use an issuer origin'});
  }
  if (env.GMAIL_REDIRECT_URI) {
    const url = new URL(env.GMAIL_REDIRECT_URI);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) ctx.addIssue({code:'custom',path:['GMAIL_REDIRECT_URI'],message:'Use HTTPS or localhost'});
  }
  if ([env.GOOGLE_CLIENT_ID,env.GOOGLE_CLIENT_SECRET,env.GMAIL_REDIRECT_URI,env.EMAIL_TOKEN_ENCRYPTION_KEY].some(Boolean) && ![env.GOOGLE_CLIENT_ID,env.GOOGLE_CLIENT_SECRET,env.GMAIL_REDIRECT_URI,env.EMAIL_TOKEN_ENCRYPTION_KEY].every(Boolean)) ctx.addIssue({code:'custom',path:['GOOGLE_CLIENT_ID'],message:'Complete Gmail OAuth configuration required'});
});
export type IntegrationConfig = z.output<typeof schema>;
export function loadIntegrationConfig(env: NodeJS.ProcessEnv): IntegrationConfig {
  const result = schema.safeParse(env);
  if (!result.success) throw new ConfigurationError('integration', result.error.issues.map(i => i.path.join('.')));
  if (env.NODE_ENV === 'production' && ((!result.data.API_TOKENS_JSON.length && !result.data.AUTH0_ISSUER) || !result.data.INTERNAL_WORKER_TOKEN)) {
    throw new ConfigurationError('integration', [...(!result.data.API_TOKENS_JSON.length && !result.data.AUTH0_ISSUER ? ['API_TOKENS_JSON'] : []), ...(!result.data.INTERNAL_WORKER_TOKEN ? ['INTERNAL_WORKER_TOKEN'] : [])]);
  }
  if (env.NODE_ENV === 'production' && result.data.PRICE_MONITOR_MODE === 'REPLAY') throw new ConfigurationError('integration', ['PRICE_MONITOR_MODE']);
  return result.data;
}
