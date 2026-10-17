import { evaluateReceipts } from './receipt-evaluation.js';
process.stdout.write(`${JSON.stringify(evaluateReceipts(),null,2)}\n`);
