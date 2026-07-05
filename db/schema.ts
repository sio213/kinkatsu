import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// 種目
export const exercises = sqliteTable(
  'exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    // preset種目の安定した識別子（将来の多言語対応用）。custom種目はnull。
    slug: text('slug'),
    category: text('category').notNull().default(''),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    note: text('note'),
    // 使う筋肉。カスタム種目でユーザーが自由入力する解説用フィールド（プリセットはlib/exercises/guides.tsを使用）
    muscle: text('muscle'),
    // フォームのポイント。JSON配列文字列 '["ポイント1","ポイント2"]'（カスタム種目のみ）
    formPoints: text('form_points'),
    source: text('source').notNull().default('custom'), // 'preset' | 'custom'
    // 計測タイプ: 'weight_reps' | 'reps' | 'time' | 'distance_time' | 'weight_time'（lib/exercises/constants.tsのMeasurementType）
    measurementType: text('measurement_type').notNull().default('weight_reps'),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (t) => ({
    bySlug: uniqueIndex('idx_exercises_slug').on(t.slug),
  }),
);

export type Exercise = typeof exercises.$inferSelect;

// トレーニングセッション（記録の1回分）
export const workoutSessions = sqliteTable('workout_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  // nullなら進行中（中断・再開の判定に使う）
  endedAt: integer('ended_at'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;

// セッションに追加された種目とその並び順（セットが1件も無い状態でも並び順を保持できるようsetsとは独立させる）
export const workoutSessionExercises = sqliteTable(
  'workout_session_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    orderIndex: integer('order_index').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    bySession: index('idx_wse_session').on(t.sessionId),
  }),
);

export type WorkoutSessionExercise = typeof workoutSessionExercises.$inferSelect;
export type NewWorkoutSessionExercise = typeof workoutSessionExercises.$inferInsert;

// セット記録。weight/reps/durationSeconds/distanceMetersは全てnullableにして
// 5種類の計測タイプ(measurementType)を1つのワイドテーブルでカバーする
export const sets = sqliteTable(
  'sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    // custom種目削除時にセットが存在すればブロックするためrestrict（記録履歴を消さない）
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceMeters: real('distance_meters'),
    // nullなら未完了（✓前）
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    bySession: index('idx_sets_session').on(t.sessionId),
    // 「前回の記録」を種目単位で辿るためのインデックス
    byExercise: index('idx_sets_exercise').on(t.exerciseId),
  }),
);

export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;

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
