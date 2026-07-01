import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 種目
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  note: text('note'),
  source: text('source').notNull().default('custom'), // 'preset' | 'custom'
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

// リマインダー設定
export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  // 'interval' | 'weekly' | 'monthly' | 'yearly'
  kind: text('kind').notNull(),
  hour: integer('hour').notNull(),
  minute: integer('minute').notNull(),
  // weekly/biweekly: JSON "[0,2,4]" (0=日〜6=土)
  weekdays: text('weekdays'),
  // monthly: JSON "[1,15,99]" (99=月末)
  monthdays: text('monthdays'),
  // biweekly/yearly/interval の起点 (epoch ms)
  anchorDate: integer('anchor_date'),
  // interval: N日ごとの N
  intervalDays: integer('interval_days'),
  // month_interval: Nヶ月ごとの N
  intervalMonths: integer('interval_months'),
  // monthly/month_interval: 第N曜日指定 (1〜4, -1=最終)
  nthWeek: integer('nth_week'),
  // monthly/month_interval: 曜日 (0=日〜6=土)
  nthWeekday: integer('nth_weekday'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

// OS通知識別子の追跡
export const reminderNotifications = sqliteTable(
  'reminder_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reminderId: integer('reminder_id')
      .notNull()
      .references(() => reminders.id, { onDelete: 'cascade' }),
    osNotificationId: text('os_notification_id').notNull(),
    // 'native' (daily/weekly/monthly) | 'queue' (biweekly/yearly/interval/月末)
    triggerType: text('trigger_type').notNull(),
    // queue のみ使用。補充判定用
    fireAt: integer('fire_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byReminder: index('idx_rn_reminder').on(t.reminderId),
    byFireAt: index('idx_rn_fire_at').on(t.fireAt),
  }),
);

export type ReminderNotification = typeof reminderNotifications.$inferSelect;
