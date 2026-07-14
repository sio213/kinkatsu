import { db } from '@/db/client';
import { reminders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { NotificationResponse } from 'expo-notifications';
import { REMINDER_NOTIFICATION_TYPE, type ReminderNotificationData } from './types';

function parseReminderNotificationData(
  response: NotificationResponse | null | undefined,
): ReminderNotificationData | null {
  const data = response?.notification.request.content.data;
  return data?.type === REMINDER_NOTIFICATION_TYPE && typeof data.reminderId === 'number'
    ? (data as ReminderNotificationData)
    : null;
}

export type ReminderTapDestination = '/' | `/routine/edit/${number}`;

// 通知タップのレスポンスから遷移先を判定する。ルーティン由来のリマインダー(reminders.routineIdが
// 設定されている)は記録タブではなく該当ルーティンの編集画面へ遷移させる。判定にDBの参照が要るため非同期
export async function resolveReminderTapDestination(
  response: NotificationResponse | null | undefined,
): Promise<ReminderTapDestination | null> {
  const data = parseReminderNotificationData(response);
  if (!data) return null;

  const [reminder] = await db
    .select({ routineId: reminders.routineId })
    .from(reminders)
    .where(eq(reminders.id, data.reminderId));

  return reminder?.routineId != null ? `/routine/edit/${reminder.routineId}` : '/';
}
