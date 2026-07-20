// カレンダーの未来予定表示（ルーティン紐付きリマインダー由来）用の集計純粋関数群。
// DB非依存でJestからテストできる（lib/calendar/day-category.tsと同じ考え方）。
// 「ルーティンの代表カテゴリ」自体はhooks/use-routines.tsのuseRoutineExerciseSummaries
// （ルーティン一覧カードと同じ集計）を流用するためここには持たない。ここにあるのは
// 「日をまたいだ代表カテゴリの決定（最も早い時刻の予定を優先）」という、実績集計
// (day-category.ts、セット数最多を優先)とは軸が異なる集計だけ

export type ScheduleFireRow = {
  dateKey: string;
  hour: number;
  minute: number;
  category: string;
};

// 「直接追加」予定（ルーティンを介さず個別に選んだ種目、2026-07-20）の表示タイトル・通知タイトルを
// 種目名から合成する。ルーティン名に相当するものが無いため、選んだ種目名自体をタイトルにする
// （user-advisor方針: 「ルーティンとして保存しますか？」のような命名ステップを挟まない）。
// exerciseNamesは選択順（orderIndex順）を想定
export function formatDirectScheduleTitle(exerciseNames: string[]): string {
  if (exerciseNames.length <= 1) return exerciseNames[0] ?? '';
  return `${exerciseNames[0]} 他${exerciseNames.length - 1}種目`;
}

// scheduledWorkoutExercisesをexercisesとJOINした行から、scheduledWorkoutIdごとの種目名リストを
// 組み立てる純粋関数。hooks/use-calendar-direct-schedule-summaries.tsとlib/notifications/
// scheduled-workout-scheduler.tsの両方が同じ集計を必要とするため共通化する（@reviewer指摘）。
// rowsの並び順（orderBy済み想定）をそのまま保持する
export function groupExerciseNamesByScheduleId(
  rows: { scheduledWorkoutId: number; name: string }[],
): Map<number, string[]> {
  const namesById = new Map<number, string[]>();
  for (const row of rows) {
    const names = namesById.get(row.scheduledWorkoutId);
    if (names) {
      names.push(row.name);
    } else {
      namesById.set(row.scheduledWorkoutId, [row.name]);
    }
  }
  return namesById;
}

// リマインダー由来の予定を特定の1日だけ打ち消す記録(PR10-6)。reminderId+日付の組み合わせを
// 1つのキーにまとめ、Set.hasでの判定を各hookから共通して使えるようにする
export function buildReminderSkipKey(reminderId: number, dateKey: string): string {
  return `${reminderId}:${dateKey}`;
}

export function buildReminderSkipSet(rows: { reminderId: number; skippedDate: string }[]): Set<string> {
  return new Set(rows.map((r) => buildReminderSkipKey(r.reminderId, r.skippedDate)));
}

// 日付ごとの代表カテゴリ（月グリッドのセルの予定リング/ドット色に使う）。同日に複数の
// 予定がある場合は最も早い時刻のものを優先する（day-category.tsの「セット数最多」とは
// 判定軸が異なるためあえて別実装にする）
export function aggregateSchedulePrimaryCategoryByDay(rows: ScheduleFireRow[]): Map<string, string> {
  const result = new Map<string, { hour: number; minute: number; category: string }>();
  for (const row of rows) {
    const existing = result.get(row.dateKey);
    if (!existing || row.hour < existing.hour || (row.hour === existing.hour && row.minute < existing.minute)) {
      result.set(row.dateKey, { hour: row.hour, minute: row.minute, category: row.category });
    }
  }
  const byDay = new Map<string, string>();
  for (const [dateKey, { category }] of result) {
    byDay.set(dateKey, category);
  }
  return byDay;
}

export type UnifiedScheduleCardInput = {
  // ルーティン紐付きの予定はnumber、「直接追加」予定（ルーティンを介さず個別に選んだ種目、
  // 2026-07-20）はnull。リマインダー由来の予定は常にルーティン紐付きのためnumberになる
  routineId: number | null;
  // ルーティン予定はルーティン名、直接予定はformatDirectScheduleTitleで合成した種目名
  title: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
  // 直接予定（routineId===null）のときだけ設定する。種目一覧カード表示
  // （DirectScheduleExerciseGroup）・編集画面への遷移時の事前選択に使う（2026-07-20）
  exerciseIds?: number[];
};

export type UnifiedScheduleCard<TReminder> =
  | (UnifiedScheduleCardInput & { key: string; source: 'reminder'; reminder: TReminder })
  | (UnifiedScheduleCardInput & { key: string; source: 'manual'; scheduledWorkoutId: number });

// 選択日パネル用。リマインダー由来の予定（非永続・削除不可）と手動予定（DB永続・削除可、PR10）を
// 1つの時刻順リストにまとめる。同じルーティンが同日に両方あると同一予定が二重に見えて紛らわしい
// ため、routineId単位で手動予定を優先し、対応するリマインダー予定は畳む
// （2026-07-19確定: 「胸→背中に差し替え」のような別ルーティンへの打ち消しではなく、あくまで
// 同一ルーティンの重複表示を防ぐdedupeに留める。リマインダー予定自体を打ち消す機能は別スコープ）
// リマインダー側だけジェネリクス（TReminder）にしているのは、reminder-form.tsxのformatKindSummary
// に生のReminder行を渡す必要があり中身を保持したいため。手動予定側は呼び出し元がscheduledWorkoutId
// 以外の生データを必要としない（drizzle-orm/hooksの型をlib層に持ち込まないためTManualは持たない）
export function mergeScheduleCards<
  TReminderCard extends UnifiedScheduleCardInput & { reminderId: number; reminder: unknown },
  TManualCard extends UnifiedScheduleCardInput & { scheduledWorkoutId: number },
>(
  reminderCards: TReminderCard[],
  manualCards: TManualCard[],
): UnifiedScheduleCard<TReminderCard['reminder']>[] {
  // 直接予定（routineIdがnull）はそもそもリマインダーと同じルーティンを指すことがあり得ないため
  // dedupe対象に含めない（リマインダーは常にルーティン紐付き）
  const manualRoutineIds = new Set(
    manualCards.flatMap((c) => (c.routineId != null ? [c.routineId] : [])),
  );
  const reminderEntries: UnifiedScheduleCard<TReminderCard['reminder']>[] = reminderCards
    .filter((c) => c.routineId == null || !manualRoutineIds.has(c.routineId))
    .map((c) => ({
      key: `reminder-${c.reminderId}`,
      routineId: c.routineId,
      title: c.title,
      categories: c.categories,
      exerciseCount: c.exerciseCount,
      hour: c.hour,
      minute: c.minute,
      exerciseIds: c.exerciseIds,
      source: 'reminder',
      reminder: c.reminder,
    }));
  const manualEntries: UnifiedScheduleCard<TReminderCard['reminder']>[] = manualCards.map((c) => ({
    key: `manual-${c.scheduledWorkoutId}`,
    routineId: c.routineId,
    title: c.title,
    categories: c.categories,
    exerciseCount: c.exerciseCount,
    hour: c.hour,
    minute: c.minute,
    exerciseIds: c.exerciseIds,
    source: 'manual',
    scheduledWorkoutId: c.scheduledWorkoutId,
  }));
  return [...reminderEntries, ...manualEntries].sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}
