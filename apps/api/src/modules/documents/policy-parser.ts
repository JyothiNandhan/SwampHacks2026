import { createHash } from 'node:crypto';
import { EvidenceSchema, PolicySchema, type Evidence, type Policy } from '@moneyback/contracts';

export interface PolicyDocument {
  sourceName: string;
  sourceUrl: string | null;
  text: string;
  acquiredAt: string;
}

export interface ParsedPolicy {
  policy: Policy;
  evidence: Evidence;
  warningCodes: string[];
}

const durationPatterns: ReadonlyArray<[Policy['policyType'], RegExp]> = [
  ['RETURN', /(?:return|refund)[\s\S]{0,80}?within\s+(\d{1,4})\s+days?/i],
  ['WARRANTY', /(?:warranty|coverage)[\s\S]{0,80}?(\d{1,3})\s+(day|month|year)s?/i],
  ['TEXTBOOK', /textbook[\s\S]{0,80}?(?:return|due)[\s\S]{0,40}?(\d{1,4})\s+days?/i],
  ['RENTAL', /rental[\s\S]{0,80}?(?:return|due)[\s\S]{0,40}?(\d{1,4})\s+days?/i]
];

/** Conservative rule parser: only explicit, cited durations become VERIFIED. */
export function parsePolicyDocument(input: {
  id: string; evidenceId: string; purchaseId: string | null; purchasedAt: string | null; document: PolicyDocument;
}): ParsedPolicy {
  if (!input.document.text.trim()) throw new Error('EMPTY_POLICY_DOCUMENT');
  const acquiredAt = new Date(input.document.acquiredAt);
  if (Number.isNaN(acquiredAt.valueOf())) throw new Error('INVALID_POLICY_DOCUMENT');
  const evidence = EvidenceSchema.parse({
    id: input.evidenceId, sourceType: 'POLICY', sourceId: input.id, category: 'POLICY_TERMS',
    acquisitionMethod: 'DOCUMENT_PARSE', rawUrl: input.document.sourceUrl,
    checksum: createHash('sha256').update(input.document.text).digest('hex'), createdAt: acquiredAt.toISOString()
  });
  const explicitType = inferType(input.document.text);
  const exclusionLines = input.document.text.split(/\r?\n|(?<=[.!?])\s+/)
    .filter(line => /(?:not eligible|excluded|excludes|non[- ]?returnable|final sale|restocking fee)/i.test(line))
    .map(line => line.trim()).filter(Boolean);
  const start = input.purchasedAt ? new Date(input.purchasedAt) : null;
  if (start && Number.isNaN(start.valueOf())) throw new Error('INVALID_PURCHASE_DATE');
  const duration = explicitType ? parseDuration(input.document.text, explicitType) : null;
  const explicitEnd = parseExplicitEndDate(input.document.text);
  const warningCodes: string[] = [];
  if (!explicitType) warningCodes.push('POLICY_TYPE_AMBIGUOUS');
  if (!duration && !explicitEnd) warningCodes.push('POLICY_END_DATE_AMBIGUOUS');
  if (!start) warningCodes.push('PURCHASE_DATE_REQUIRED');
  const end = explicitEnd ?? (start && duration ? addDuration(start, duration.amount, duration.unit) : null);
  const eligibility: Policy['eligibility'] = explicitType && end && start ? 'VERIFIED' : 'REVIEW_REQUIRED';
  const policy = PolicySchema.parse({
    id: input.id, purchaseId: input.purchaseId, policyType: explicitType ?? 'RETURN',
    sourceName: input.document.sourceName, sourceUrl: input.document.sourceUrl, evidenceIds: [evidence.id],
    rawTerms: { excerpt: citedExcerpt(input.document.text, duration?.match), duration: duration ? `${duration.amount} ${duration.unit}` : null,
      explicitEndAt: explicitEnd?.toISOString() ?? null, retentionCategory: retentionCategory(explicitType) },
    exclusions: exclusionLines, eligibility, parsedStartAt: start?.toISOString() ?? null, parsedEndAt: end?.toISOString() ?? null
  });
  return { policy, evidence, warningCodes };
}

function inferType(text: string): Policy['policyType'] | null {
  const found = durationPatterns.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
  if (found.length === 1) return found[0];
  const keywords: Array<[Policy['policyType'],RegExp]>=[['RETURN',/\breturn|refund\b/i],['WARRANTY',/\bwarranty|coverage\b/i],
    ['RENTAL',/\brental\b/i],['TEXTBOOK',/\btextbook\b/i],['GIFTCARD',/gift[ -]?card/i],['SUBSCRIPTION',/subscription|recurring billing/i]];
  const keywordMatches=keywords.filter(([,pattern])=>pattern.test(text)).map(([type])=>type);
  if(keywordMatches.length===1)return keywordMatches[0];
  return null;
}

function parseDuration(text: string, type: Policy['policyType']): { amount: number; unit: 'DAY' | 'MONTH' | 'YEAR'; match: string } | null {
  const pattern = durationPatterns.find(([candidate]) => candidate === type)?.[1];
  const match = pattern?.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount < 1 || amount > 3650) return null;
  const rawUnit = match[2]?.toUpperCase();
  return { amount, unit: rawUnit === 'MONTH' ? 'MONTH' : rawUnit === 'YEAR' ? 'YEAR' : 'DAY', match: match[0] };
}

function addDuration(date: Date, amount: number, unit: 'DAY' | 'MONTH' | 'YEAR'): Date {
  const result = new Date(date);
  if (unit === 'DAY') result.setUTCDate(result.getUTCDate() + amount);
  if (unit === 'MONTH') result.setUTCMonth(result.getUTCMonth() + amount);
  if (unit === 'YEAR') result.setUTCFullYear(result.getUTCFullYear() + amount);
  return result;
}

function citedExcerpt(text: string, match?: string): string {
  if (!match) return text.trim().slice(0, 500);
  const index = text.indexOf(match);
  return text.slice(Math.max(0, index - 100), Math.min(text.length, index + match.length + 100)).trim();
}

function parseExplicitEndDate(text:string):Date|null{
  const match=/(?:return by|due by|expires?(?: on)?|valid until)\s+((?:20\d{2}-\d{2}-\d{2})|(?:[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}))/i.exec(text);
  if(!match)return null;
  const date=new Date(`${match[1]}${/^20\d{2}-/.test(match[1])?'T23:59:59.000Z':' 23:59:59 UTC'}`);
  return Number.isNaN(date.valueOf())?null:date;
}
function retentionCategory(type:Policy['policyType']|null):'KEEP_ORIGINAL'|'KEEP_DIGITAL'|'REVIEW'{
  return type==='WARRANTY'||type==='RENTAL'||type==='TEXTBOOK'?'KEEP_ORIGINAL':type?'KEEP_DIGITAL':'REVIEW';
}

