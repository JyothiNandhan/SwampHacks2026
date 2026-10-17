import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema';

export interface SavingsNotification {
  userId: string;
  opportunityId: string;
  type: 'PRICE_DROP' | 'REFUND' | 'BILLING' | 'DEADLINE';
  title: string;
  message: string;
  createdAt: string;
  readAt: string;
  synthetic: number;
}

export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [...USERS_COLUMNS],
  permissions: {
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: false, update: true, delete: true }
  }
};

export const savingsNotificationsSchema: CollectionSchema = {
  name: 'savings-notifications',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    { name: 'opportunityId', storage: 'text', interpretation: 'plain', immutable: true, required: true },
    { name: 'type', storage: 'text', interpretation: { kind: 'select', options: ['PRICE_DROP', 'REFUND', 'BILLING', 'DEADLINE'] }, required: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'message', storage: 'text', interpretation: 'plain', required: true },
    { name: 'createdAt', storage: 'text', interpretation: { kind: 'datetime' }, immutable: true, required: true },
    { name: 'readAt', storage: 'text', interpretation: { kind: 'datetime' }, default: '' },
    { name: 'synthetic', storage: 'number', interpretation: { kind: 'boolean' }, immutable: true, required: true }
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true }
  }
};

export const schemas: CollectionSchema[] = [usersSchema, savingsNotificationsSchema];
