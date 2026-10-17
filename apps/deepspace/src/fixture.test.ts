import { expect, test } from 'vitest';
import { savingsNotificationsSchema } from './schema';
import { syntheticNotification } from './fixture';

test('synthetic notification matches the declared collection columns', () => {
  expect(Object.keys(syntheticNotification).sort()).toEqual(
    savingsNotificationsSchema.columns.map(column => column.name).sort()
  );
  expect(syntheticNotification.synthetic).toBe(1);
  expect(syntheticNotification.message).toContain('User approval');
});
