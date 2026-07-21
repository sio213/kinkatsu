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

// 直接予定（個別種目選択、routineIdなし）の削除確認Alertの本文。直接予定自身の編集画面ヘッダー⋮
// (app/calendar/schedule-workout-edit.tsxのhandleDeleteWorkout、下のbuildScheduledWorkoutDeleteMessage
// 経由)から参照する（2026-07-22、選択日パネル側の⋮メニュー撤去により削除操作はこの画面に一本化された）
export const DIRECT_SCHEDULE_DELETE_MESSAGE =
  'この予定に設定した種目と目標セットもすべて削除され、通知も届かなくなります。';

// 手動で追加したルーティン予定の削除確認Alertの本文。削除されるのはこの予定枠と通知だけで、
// ルーティン本体は影響を受けないため、その旨を安心材料として明記する（@ユーザー指摘:
// ルーティン名がカードにそのまま表示されているため、ルーティン本体まで消えるという誤解を
// 防ぐ必要がある）。下のbuildScheduledWorkoutDeleteMessage（routineIdの有無で出し分けが必要な
// schedule-workout-edit.tsx向け）から使う
export function buildRoutineScheduleDeleteMessage(routineName: string): string {
  return `「${routineName}」自体には影響しません。この予定と通知だけを削除します。`;
}

// 予定削除確認Alertの本文をrouteIdの有無で出し分ける共通ビルダー（2026-07-21）。
// app/calendar/schedule-workout-edit.tsxのhandleDeleteWorkout（実体化済みルーティン予定・
// 直接予定どちらもこの画面に来るようになった、PR5。2026-07-22より削除操作自体もこの画面に
// 一本化された、単一の削除ハンドラがどちらの種別かを自分で判定する必要がある）から呼ぶ。
// routineNameはroutineId!=nullのときだけ意味を持つため、呼び出し側はその場合だけ渡せばよい
// （routineId==nullなのにroutineNameを渡しても無視される）
export function buildScheduledWorkoutDeleteMessage(routineId: number | null, routineName: string | undefined): string {
  return routineId != null && routineName != null
    ? buildRoutineScheduleDeleteMessage(routineName)
    : DIRECT_SCHEDULE_DELETE_MESSAGE;
}

// 「直接追加」予定（ルーティンを介さず個別に選んだ種目、2026-07-20）の表示タイトル・通知タイトルを
// 種目名から合成する。ルーティン名に相当するものが無いため、選んだ種目名自体をタイトルにする
// （user-advisor方針: 「ルーティンとして保存しますか？」のような命名ステップを挟まない）。
// exerciseNamesは選択順（orderIndex順）を想定。0件（作成時は起こらないが、2026-07-22の
// 「最後の1種目も削除できる」仕様変更後は、編集画面で全種目を削除すると到達する）は
// 空文字ではなくフォールバック文言にする（@designer指摘: 空文字だとカレンダー日パネルの
// カード見出しやaccessibilityLabelが「「」夜20:00に種目を追加」のように壊れて見える）
export function formatDirectScheduleTitle(exerciseNames: string[]): string {
  if (exerciseNames.length === 0) return '種目未設定';
  if (exerciseNames.length === 1) return exerciseNames[0];
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
    source: 'manual',
    scheduledWorkoutId: c.scheduledWorkoutId,
  }));
  return [...reminderEntries, ...manualEntries].sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}
