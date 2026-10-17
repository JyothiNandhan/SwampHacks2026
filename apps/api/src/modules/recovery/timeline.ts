import { DeadlineSchema, EventSchema, NotificationSchema, type Deadline, type Event, type Notification, type Policy } from '@moneyback/contracts';

export interface TimelineArtifacts { deadline: Deadline; event: Event; notification: Notification }

export function createPolicyTimeline(input: {
  purchaseId: string; policy: Policy; ids: { deadlineId: string; eventId: string; notificationId: string };
  now: string; reminderWindowDays?: number;
}): TimelineArtifacts | null {
  if (input.policy.purchaseId !== input.purchaseId || !input.policy.parsedEndAt || input.policy.eligibility !== 'VERIFIED') return null;
  const type = deadlineType(input.policy.policyType);
  if (!type) return null;
  const now = new Date(input.now);
  const end = new Date(input.policy.parsedEndAt);
  if (Number.isNaN(now.valueOf()) || Number.isNaN(end.valueOf())) throw new Error('INVALID_TIMELINE_DATE');
  const remainingDays = Math.ceil((end.valueOf()-now.valueOf())/86_400_000);
  const deadline = DeadlineSchema.parse({ id:input.ids.deadlineId,purchaseId:input.purchaseId,policyId:input.policy.id,
    type,deadlineAt:end.toISOString(),evidenceIds:input.policy.evidenceIds });
  const event = EventSchema.parse({ id:input.ids.eventId,entityType:'PURCHASE',entityId:input.purchaseId,eventType:`${type}_DEADLINE_CAPTURED`,
    eventPayload:{policyId:input.policy.id,deadlineAt:end.toISOString(),remainingDays},createdAt:now.toISOString() });
  const notification = NotificationSchema.parse({ id:input.ids.notificationId,opportunityId:null,type:notificationType(type),
    title:`${human(type)} deadline`,message: remainingDays < 0 ? `${human(type)} deadline passed ${Math.abs(remainingDays)} day(s) ago.` :
      `${human(type)} deadline is in ${remainingDays} day(s).`,createdAt:now.toISOString(),readAt:null });
  return {deadline,event,notification};
}

function deadlineType(type: Policy['policyType']): Deadline['type'] | null {
  return type === 'RETURN' ? 'RETURN' : type === 'WARRANTY' ? 'WARRANTY' : type === 'RENTAL' ? 'RENTAL' :
    type === 'TEXTBOOK' ? 'TEXTBOOK' : type === 'GIFTCARD' ? 'GIFT_CARD' : null;
}
function notificationType(type: Deadline['type']): Notification['type'] {
  return type === 'RETURN' ? 'RETURN_DEADLINE' : type === 'GIFT_CARD' ? 'GIFT_CARD' : type;
}
function human(type: Deadline['type']): string { return type.toLowerCase().replace('_',' '); }

