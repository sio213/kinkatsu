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
