import { expect, test } from 'vitest';
import { evaluateReceipts } from './receipt-evaluation.js';
test('T23 measured synthetic receipt/duplicate/policy regression dataset',()=>{
  const report=evaluateReceipts(); expect(report.passed).toBe(report.total); expect(report.total).toBe(15);
});
