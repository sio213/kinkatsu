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
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useReminders() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);

  const { data } = useLiveQuery(db.select().from(reminders));
  const list: Reminder[] = data ?? [];

  function getNextFire(r: Reminder): Date | null {
    try {
      return getNextFireDate(parseReminder(r), now);
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
