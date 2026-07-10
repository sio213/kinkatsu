import type { NotificationResponse } from 'expo-notifications';
import { REMINDER_NOTIFICATION_TYPE } from './types';

// 通知タップのレスポンスから遷移先を判定する純粋関数
export function resolveReminderTapRoute(
  response: NotificationResponse | null | undefined,
): '/' | null {
  const data = response?.notification.request.content.data;
  return data?.type === REMINDER_NOTIFICATION_TYPE ? '/' : null;
}
