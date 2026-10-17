import { z } from 'zod';

const optionalSecret = z.preprocess(value => value === '' ? undefined : value, z.string().trim().min(1).optional());
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(3001),
  DATABASE_URL: z.preprocess(value => value === '' ? undefined : value,
    z.url({ protocol: /^postgres(ql)?$/ }).optional()),
  NESSIE_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://api.reimaginebanking.com'),
  NESSIE_API_KEY: optionalSecret,
  NESSIE_ACCOUNT_ID: optionalSecret
}).superRefine((env, ctx) => {
  const url = new URL(env.NESSIE_BASE_URL);
  if (url.username || url.password || url.search || url.hash) {
    ctx.addIssue({ code: 'custom', path: ['NESSIE_BASE_URL'], message: 'Use a base URL without credentials, query or fragment' });
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    ctx.addIssue({ code: 'custom', path: ['NESSIE_BASE_URL'], message: 'Use HTTPS for remote Nessie servers' });
  }
  if (env.NODE_ENV === 'production') {
    for (const key of ['DATABASE_URL', 'NESSIE_API_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required in production' });
    }
  }
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl?: string;
  readonly nessie: { readonly baseUrl: string; readonly apiKey?: string; readonly accountId?: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Never retain Zod issues: they can include user-supplied secrets/connection strings.
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  const value = result.data;
  return Object.freeze({
    nodeEnv: value.NODE_ENV, port: value.PORT, databaseUrl: value.DATABASE_URL,
    nessie: Object.freeze({ baseUrl: value.NESSIE_BASE_URL, apiKey: value.NESSIE_API_KEY, accountId: value.NESSIE_ACCOUNT_ID })
  });
}
