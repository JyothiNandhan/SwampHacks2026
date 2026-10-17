import fs from 'node:fs';
const env = JSON.parse(fs.readFileSync(new URL('../config/env-contract.json', import.meta.url), 'utf8'));
const example = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const names = example.split(/\r?\n/).filter(s => s && !s.startsWith('#')).map(s => s.split('=')[0]);
for (const name of env.allNames) if (!names.includes(name)) throw new Error('Missing environment key: ' + name);
console.log('Environment scaffold consistent; contract freeze follows in T02');
