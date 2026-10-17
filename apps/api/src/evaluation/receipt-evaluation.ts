import { matchReceiptToTransactions, detectDuplicateReceipts } from '../modules/matching/receipt-matcher.js';
import { parsePolicyDocument } from '../modules/documents/policy-parser.js';
import { compareRentalBill } from '../modules/documents/billing-comparison.js';
import { ReceiptExtractionSchema, type Receipt, type Transaction } from '@moneyback/contracts';

export function evaluateReceipts() {
  const receipt:Receipt={id:'r',source:'PHOTO',merchantName:'Shop',orderNumber:'ORDER-42',purchasedAt:'2026-10-01T12:00:00Z',totalCents:10000,currency:'USD',originalFileId:'original',extractionStatus:'EXTRACTED'};
  const payment:Transaction={id:'t',nessiePurchaseId:'n',accountId:'a',merchantId:null,merchantName:'Shop',amountCents:10000,currency:'USD',occurredAt:'2026-10-01T12:00:00Z',receiptStatus:'UNMATCHED'};
  const policy=(text:string,purchasedAt:string|null=receipt.purchasedAt)=>parsePolicyDocument({id:'p',evidenceId:'e',purchaseId:'purchase',purchasedAt,document:{sourceName:'Synthetic terms',sourceUrl:null,text,acquiredAt:'2026-10-17T12:00:00Z'}});
  const duplicate=(r:Receipt)=>detectDuplicateReceipts([{receipt},{receipt:r}]).groups.length>0;
  const cases:[string,string,boolean][]=[
    ['receipt-exact','matching',matchReceiptToTransactions(receipt,[payment])[0].status==='CONFIRMED'],
    ['wrong-merchant','matching',matchReceiptToTransactions(receipt,[{...payment,merchantName:'Other Company'}])[0].status!=='CONFIRMED'],
    ['wrong-amount','matching',matchReceiptToTransactions(receipt,[{...payment,amountCents:12000}])[0].status!=='CONFIRMED'],
    ['wrong-date','matching',matchReceiptToTransactions(receipt,[{...payment,occurredAt:'2025-01-01T00:00:00Z'}])[0].status!=='CONFIRMED'],
    ['missing-receipt-fields','matching',matchReceiptToTransactions({...receipt,merchantName:null,purchasedAt:null,totalCents:null},[payment])[0].status!=='CONFIRMED'],
    ['paper-email-same-order','duplicates',duplicate({...receipt,id:'email',source:'EMAIL'})],
    ['different-order','duplicates',!duplicate({...receipt,id:'other',orderNumber:'OTHER'})],
    ['different-total','duplicates',!duplicate({...receipt,id:'other',totalCents:20000})],
    ['unknown-order','duplicates',!duplicate({...receipt,id:'other',orderNumber:null})],
    ['policy-explicit-duration','policies',policy('Returns accepted within 30 days.').policy.parsedEndAt==='2026-10-31T12:00:00.000Z'],
    ['policy-ambiguous','policies',policy('Returns may be accepted. Ask store.').policy.eligibility==='REVIEW_REQUIRED'],
    ['policy-no-purchase-date','policies',policy('Returns within 30 days.',null).policy.eligibility==='REVIEW_REQUIRED'],
    ['policy-exclusions-retained','policies',policy('Returns within 30 days. Final sale items are non-returnable.').policy.exclusions.length>0],
    ['incorrect-paper-shape','extraction-validation',!ReceiptExtractionSchema.safeParse({receipt:{totalCents:10.5},items:[],warningCodes:[]}).success],
    ['unsupported-rental-fee','billing',compareRentalBill({purchaseId:'p',agreement:[],finalBill:[{label:'Cleaning fee',amountCents:2000,evidenceId:null}],evidence:[]}).comparison.eligibility==='REVIEW_REQUIRED']
  ];
  return { dataset:'synthetic-regression-v1',mode:'OFFLINE_FIXTURE',total:cases.length,passed:cases.filter(c=>c[2]).length,
    cases:cases.map(([id,category,passed])=>({id,category,passed})),
    limitations:['Synthetic fixtures; not a measured real-world OCR accuracy estimate.','Gemini is mocked; no live model call.','Policy applicability and ambiguous matches still require review.'] };
}
