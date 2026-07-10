import { resolveReminderTapRoute } from '@/lib/notifications/tap-handler';
import type { NotificationResponse } from 'expo-notifications';

function makeResponse(data: unknown): NotificationResponse {
  return {
    notification: {
      request: {
        identifier: 'id-1',
        content: { data },
      },
    },
  } as unknown as NotificationResponse;
}

describe('resolveReminderTapRoute', () => {
  test('responseがnullなら遷移しない', () => {
    expect(resolveReminderTapRoute(null)).toBeNull();
  });

  test('responseがundefinedなら遷移しない', () => {
    expect(resolveReminderTapRoute(undefined)).toBeNull();
  });

  test('dataが無い通知（テスト通知など）は遷移しない', () => {
    expect(resolveReminderTapRoute(makeResponse(undefined))).toBeNull();
  });

  test('data.typeがreminder以外なら遷移しない', () => {
    expect(resolveReminderTapRoute(makeResponse({ type: 'other' }))).toBeNull();
  });

  test('data.type===reminderなら記録タブへの遷移を返す', () => {
    expect(
      resolveReminderTapRoute(makeResponse({ type: 'reminder', reminderId: 1 })),
    ).toBe('/');
  });
});
