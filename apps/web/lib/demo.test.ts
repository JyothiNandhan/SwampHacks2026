import { describe, expect, it } from 'vitest';
import { demoPurchases, purchaseMatchesQuery } from './demo';

describe('purchase search', () => {
    const bose = demoPurchases[0]!;

    it('ignores surrounding whitespace and letter case', () => {
        expect(purchaseMatchesQuery(bose, '  bOsE  ')).toBe(true);
    });

    it('searches categories and normalizes compatible Unicode', () => {
        expect(purchaseMatchesQuery(bose, 'electronics')).toBe(true);
        expect(purchaseMatchesQuery({ ...bose, name: 'Cafe\u0301 Maker' }, 'Caf\u00e9')).toBe(true);
    });

    it('treats HTML-like input as ordinary text', () => {
        expect(purchaseMatchesQuery(bose, '<script>alert(1)</script>')).toBe(false);
    });
});
