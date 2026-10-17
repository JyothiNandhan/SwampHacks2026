import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TigerDataMigration {
  id: string;
  name: string;
  description: string;
  sql: string;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  resolve(currentDir, 'migrations/001_init_tiger_data.sql'),
  'utf8',
);

const serpApiSql = readFileSync(resolve(currentDir, 'migrations/002_serpapi_source.sql'), 'utf8');

export const tigerDataMigrations: TigerDataMigration[] = [
  {
    id: '001_init_tiger_data',
    name: '001_init_tiger_data',
    description:
      'Create the canonical MoneyBack OS schema for users, bank accounts, purchase data, evidence, offers, policies, cases, refunds, subscriptions, jobs and events.',
    sql: migrationSql,
  },
  {id: '002_serpapi_source', name: '002_serpapi_source', description: 'Allow accurately labeled SerpApi observations while preserving historic sources.', sql: serpApiSql},
];

export const tigerDataMigrationOrder = tigerDataMigrations.map((migration) => migration.id);
