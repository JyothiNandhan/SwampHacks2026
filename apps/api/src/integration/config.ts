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
  BESTBUY_API_KEY: optional, BRIGHTDATA_API_KEY: optional,
  BRIGHTDATA_AMAZON_DATASET_ID: optional, BRIGHTDATA_WALMART_DATASET_ID: optional,
  PRICE_MONITOR_MODE: z.enum(['LIVE', 'REPLAY']).default('LIVE')
}).superRefine((env, ctx) => {
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) ctx.addIssue({ code: 'custom', path: ['GEMINI_MODEL'], message: 'Required when enabled' });
});
export type IntegrationConfig = z.output<typeof schema>;
export function loadIntegrationConfig(env: NodeJS.ProcessEnv): IntegrationConfig {
  const result = schema.safeParse(env);
  if (!result.success) throw new ConfigurationError('integration', result.error.issues.map(i => i.path.join('.')));
  if (env.NODE_ENV === 'production' && (!result.data.API_TOKENS_JSON.length || !result.data.INTERNAL_WORKER_TOKEN)) {
    throw new ConfigurationError('integration', [...(!result.data.API_TOKENS_JSON.length ? ['API_TOKENS_JSON'] : []), ...(!result.data.INTERNAL_WORKER_TOKEN ? ['INTERNAL_WORKER_TOKEN'] : [])]);
  }
  if (env.NODE_ENV === 'production' && result.data.PRICE_MONITOR_MODE === 'REPLAY') throw new ConfigurationError('integration', ['PRICE_MONITOR_MODE']);
  return result.data;
}
