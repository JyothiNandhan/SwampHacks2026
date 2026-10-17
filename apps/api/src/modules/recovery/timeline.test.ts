import { expect,test } from 'vitest';
import { createPolicyTimeline } from './timeline.js';
test('T18 emits a cited textbook deadline, event, and notification',()=>{
  const result=createPolicyTimeline({purchaseId:'p',policy:{id:'policy',purchaseId:'p',policyType:'TEXTBOOK',sourceName:'Campus store',sourceUrl:null,evidenceIds:['e'],rawTerms:{},exclusions:[],eligibility:'VERIFIED',parsedStartAt:'2026-10-01T00:00:00Z',parsedEndAt:'2026-11-01T00:00:00Z'},ids:{deadlineId:'d',eventId:'ev',notificationId:'n'},now:'2026-10-17T00:00:00Z'});
  expect(result).toMatchObject({deadline:{type:'TEXTBOOK',evidenceIds:['e']},notification:{type:'TEXTBOOK'}});
});
