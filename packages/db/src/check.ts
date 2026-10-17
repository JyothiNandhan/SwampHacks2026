import { tigerDataMigrations } from './index.js';
if (new Set(tigerDataMigrations.map(m => m.id)).size !== tigerDataMigrations.length) {
  throw new Error('Duplicate migration IDs');
}
for (const migration of tigerDataMigrations) {
  if (!migration.sql.trim()) throw new Error(`Empty migration: ${migration.id}`);
}
console.log('Migration manifest valid:', tigerDataMigrations.map(m => m.id));
