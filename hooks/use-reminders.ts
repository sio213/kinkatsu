import { db } from '@/db/client';
import { reminders, type Reminder } from '@/db/schema';
import {
  createReminder,
  deleteReminder,
  getNextFireDate,
  parseReminder,
  sendTestNotification,
  setReminderEnabled,
  updateReminder,
} from '@/lib/notifications/scheduler';
import type { ReminderInput } from '@/lib/notifications/types';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export function useReminders() {
  const { data } = useLiveQuery(db.select().from(reminders));
  const list: Reminder[] = data ?? [];

  function getNextFire(r: Reminder): Date | null {
    try {
      return getNextFireDate(parseReminder(r), new Date());
    } catch {
      return null;
    }
  }

  return {
    reminders: list,
    createReminder: (input: ReminderInput) => createReminder(input),
    updateReminder: (id: number, input: ReminderInput) => updateReminder(id, input),
    toggleReminder: (id: number, enabled: boolean) => setReminderEnabled(id, enabled),
    removeReminder: (id: number) => deleteReminder(id),
    sendTest: (title: string, body: string) => sendTestNotification(title, body),
    getNextFire,
  };
}
