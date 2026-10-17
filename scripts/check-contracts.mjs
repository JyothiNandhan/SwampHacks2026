import fs from 'node:fs';
const base = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, base), 'utf8');
const env = JSON.parse(read('config/env-contract.json'));
const names = read('.env.example').split(/\r?\n/).filter(s => s && !s.startsWith('#')).map(s => s.split('=')[0]);
const missing = env.allNames.filter(name => !names.includes(name));
if (missing.length) throw new Error('Environment names missing: ' + missing.join(','));
const registry = JSON.parse(read('config/api-contract.json'));
const seen = new Set();
const body = read('packages/contracts/src/index.ts');
for (const route of registry.routes) {
  const key = route.method + ' ' + route.path;
  if (seen.has(key)) throw new Error('Duplicate route ' + key);
  seen.add(key);
  if (!route.owner || !route.security) throw new Error('Missing owner/security: ' + key);
}
for (const schema of ['Transaction', 'Receipt', 'ReceiptItem', 'Purchase', 'ProductOffer', 'Policy', 'Opportunity', 'RecoveryCase', 'Refund', 'Event', 'Evidence', 'Error']) {
  if (!body.includes('export const ' + schema + 'Schema')) throw new Error('Missing shared schema ' + schema);
  if (!fs.existsSync(new URL(`packages/contracts/fixtures/${schema}.json`, base))) throw new Error('Missing fixture ' + schema);
}
if (registry.contractVersion !== JSON.parse(read('packages/contracts/package.json')).version) throw new Error('Contract version mismatch');
console.log('Contract fixtures, environment names and API registry consistent');
