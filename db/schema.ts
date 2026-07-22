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
    // フォームのポイント。JSON配列文字列 '["ポイント1","ポイント2"]'（カスタム種目のみ）
    formPoints: text('form_points'),
    source: text('source').notNull().default('custom'), // 'preset' | 'custom'
    // 計測タイプ: 'weight_reps' | 'reps' | 'time' | 'distance_time' | 'weight_time'（lib/exercises/constants.tsのMeasurementType）。
    // 既存preset種目の値はdrizzle/0010_recording_feature_m1.sqlのUPDATE文でdb/seed.tsのデータからバックフィル済み。
    // 以後db/seed.tsの分類を変更した場合はマイグレーションではなくseed()のupdate分岐（差分検知）が自己修復する。
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
export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startedAt: integer('started_at').notNull(),
    // nullなら進行中（中断・再開の判定に使う）
    endedAt: integer('ended_at'),
    // ルーティンから開始した場合のみ設定（startWorkoutFromRoutine/startPastWorkoutFromRoutine）。
    // 「自分で選ぶ」等の手動開始はnullのまま（再開バナーの表示分岐: ルーティン名 or「トレーニング中」、
    // 2026-07-20）。ルーティン削除後もセッション自体の記録（過去の実施履歴）は残す必要があるため、
    // restrictではなくset nullにする（references()はroutinesがこのファイルの後方で定義されているが、
    // コールバック経由の遅延評価のため forward reference として問題なく解決される）
    routineId: integer('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    // 予定（scheduledWorkouts）から開始した場合のみ設定（startWorkoutFromScheduledWorkout）。
    // endWorkoutSession完了時に、この予定を「消化済み」としてscheduledWorkouts側から削除する
    // ために使う（直接予定・実体化済みルーティン予定・実体化直後のリマインダー予定のいずれも
    // このFK経由で統一的に扱える、2026-07-21）。スケジュール側が別経路で先に削除されても
    // セッションの記録自体は残す必要があるため、set nullにする（routineIdと同じ方針）
    scheduledWorkoutId: integer('scheduled_workout_id').references(() => scheduledWorkouts.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    byRoutine: index('idx_ws_routine').on(t.routineId),
  }),
);

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
    // 同じ種目をセッション内に複数回追加できるため、どのカード（workoutSessionExercises行）に
    // 属するセットかを紐付ける。カード削除時はそのカードのセットも一緒に消えてよいためcascade
    workoutSessionExerciseId: integer('workout_session_exercise_id')
      .notNull()
      .references(() => workoutSessionExercises.id, { onDelete: 'cascade' }),
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
    // トレーニング中画面でカード（workoutSessionExercises）ごとにセットをグルーピングするためのインデックス
    byWorkoutSessionExercise: index('idx_sets_wse').on(t.workoutSessionExerciseId),
  }),
);

export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;

// ルーティン（種目のまとまりに名前を付けて保存したテンプレート）
export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // 一覧での並び順（⋮メニューの上へ/下へ移動で更新）
  orderIndex: integer('order_index').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;

// ルーティンに含まれる種目とその並び順（workoutSessionExercisesと同じ理由でセットとは独立させる）
export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    routineId: integer('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    orderIndex: integer('order_index').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byRoutine: index('idx_re_routine').on(t.routineId),
  }),
);

export type RoutineExercise = typeof routineExercises.$inferSelect;
export type NewRoutineExercise = typeof routineExercises.$inferInsert;

// ルーティンの目標セット（実施記録ではなくテンプレート値のため、sets と違い completedAt を持たない）
export const routineSets = sqliteTable(
  'routine_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    routineExerciseId: integer('routine_exercise_id')
      .notNull()
      .references(() => routineExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceMeters: real('distance_meters'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byRoutineExercise: index('idx_rs_routine_exercise').on(t.routineExerciseId),
  }),
);

export type RoutineSet = typeof routineSets.$inferSelect;
export type NewRoutineSet = typeof routineSets.$inferInsert;

// リマインダー設定
export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // ルーティン由来のリマインダーはここにルーティンを指す。単体リマインダーはnull。
  // ルーティン削除時はアプリ層のdeleteReminder()経由でOS通知キャンセル込みで先に消すため、
  // ここでのset nullはあくまで安全網（削除漏れでリマインダー行だけ残っても孤児参照にしない）
  routineId: integer('routine_id').references(() => routines.id, { onDelete: 'set null' }),
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
  // monthly/month_interval: 曜日(複数選択可) JSON "[1,3]" (0=日〜6=土)
  nthWeekdays: text('nth_weekdays'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  byRoutine: index('idx_reminders_routine').on(t.routineId),
}));

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

// カレンダーで手動追加した予定（リマインダーとは無関係に「特定の日にこのルーティンをやる」を
// 1件だけ置くもの、PR10確定仕様）。リマインダーは繰り返し設定+通知が本体なのに対し、こちらは
// 単発の日付+時刻のみを持つ薄いレコード。ルーティン削除時は「そのルーティンをやる予定」自体が
// 意味を失うためcascadeで一緒に消す（remindersのset nullとは異なり、孤児化を許容する理由が無い）
export const scheduledWorkouts = sqliteTable(
  'scheduled_workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // ルーティンから追加した予定のみ設定。個別に種目を選んで追加した予定（「直接追加」、
    // 2026-07-20）はnullのまま——中身はscheduledWorkoutExercisesに持つ。routineId有無の
    // 二値がそのまま「ルーティン予定か直接予定か」の判定になる（workoutSessions.routineIdと
    // 同じ設計方針）
    routineId: integer('routine_id').references(() => routines.id, { onDelete: 'cascade' }),
    // カレンダーのtoDateKey(lib/calendar/date-grid.ts)と同じ'YYYY-MM-DD'形式。月表示グリッドとの
    // 突合・範囲検索が文字列比較のみで完結し、epoch msで持つ場合に発生しうるタイムゾーンずれの
    // 心配が要らないため（この行が表すのは「特定の瞬間」ではなく「カレンダー上の1日」）
    scheduledDate: text('scheduled_date').notNull(),
    hour: integer('hour').notNull(),
    minute: integer('minute').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    byDate: index('idx_sw_date').on(t.scheduledDate),
    byRoutine: index('idx_sw_routine').on(t.routineId),
  }),
);

export type ScheduledWorkout = typeof scheduledWorkouts.$inferSelect;
export type NewScheduledWorkout = typeof scheduledWorkouts.$inferInsert;

// 「直接追加」（ルーティンを介さず個別に選んだ種目で予定を作る、2026-07-20）の中身。
// routineExercises/workoutSessionExercisesと同じ形（セットとは独立、並び順を保持）。
// 目標セット値は下のscheduledWorkoutSetsに持たせる（実施時はそちらを優先し、未設定の種目だけ
// 前回記録にフォールバックする、lib/workout/session.tsのstartWorkoutFromScheduledWorkout参照）
export const scheduledWorkoutExercises = sqliteTable(
  'scheduled_workout_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduledWorkoutId: integer('scheduled_workout_id')
      .notNull()
      .references(() => scheduledWorkouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    orderIndex: integer('order_index').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    bySchedule: index('idx_swe_schedule').on(t.scheduledWorkoutId),
  }),
);

export type ScheduledWorkoutExercise = typeof scheduledWorkoutExercises.$inferSelect;
export type NewScheduledWorkoutExercise = typeof scheduledWorkoutExercises.$inferInsert;

// 直接追加予定の種目に持たせる「目標セット」（2026-07-20）。routineSetsと全く同じ形。
// 実施記録ではなく計画値のため、setsと違いcompletedAtを持たない（routineSetsと同じ理由）。
// 実施時（startWorkoutFromScheduledWorkout）はこの目標セットがあればそれをコピーし、
// 無ければ従来通り種目ごとの前回記録にフォールバックする
export const scheduledWorkoutSets = sqliteTable(
  'scheduled_workout_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduledWorkoutExerciseId: integer('scheduled_workout_exercise_id')
      .notNull()
      .references(() => scheduledWorkoutExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceMeters: real('distance_meters'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byExercise: index('idx_sws_exercise').on(t.scheduledWorkoutExerciseId),
  }),
);

export type ScheduledWorkoutSet = typeof scheduledWorkoutSets.$inferSelect;
export type NewScheduledWorkoutSet = typeof scheduledWorkoutSets.$inferInsert;

// リマインダー由来の予定を「特定の1日だけ」打ち消す記録（PR10-6）。リマインダーの繰り返し設定
// 自体（reminders行）は変更せず、「このreminderIdはこの日だけ発火させない」という除外を
// 別テーブルで持つ。scheduledDateはscheduledWorkouts.scheduledDateと同じ'YYYY-MM-DD'形式。
// 同じ日を二重に打ち消せても意味が無いためunique制約を付ける。リマインダー削除時は
// このスキップ記録も無意味になるためcascadeで一緒に消す
export const reminderScheduleSkips = sqliteTable(
  'reminder_schedule_skips',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reminderId: integer('reminder_id')
      .notNull()
      .references(() => reminders.id, { onDelete: 'cascade' }),
    skippedDate: text('skipped_date').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    // reminderId単体の絞り込みはこの複合ユニークインデックスの先頭列でカバーされるため、
    // 単独インデックスは冗長として持たない(@reviewer指摘)
    uniqueSkip: uniqueIndex('idx_rss_unique').on(t.reminderId, t.skippedDate),
  }),
);

export type ReminderScheduleSkip = typeof reminderScheduleSkips.$inferSelect;
export type NewReminderScheduleSkip = typeof reminderScheduleSkips.$inferInsert;
