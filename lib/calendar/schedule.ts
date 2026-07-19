// カレンダーの未来予定表示（ルーティン紐付きリマインダー由来）用の集計純粋関数群。
// DB非依存でJestからテストできる（lib/calendar/day-category.tsと同じ考え方）。
// 実績集計(day-category.ts)とは判定軸が異なる別物のためあえて共有しない:
// - day-category.ts: 完了済みセット単位、代表カテゴリは「セット数最多、タイは先にやった種目」
// - この関数群: リマインダーの発火単位、代表カテゴリは「そのルーティンで種目数最多、タイは
//   先に追加した種目」。日をまたいだ代表カテゴリのタイブレークは「その日最も早い時刻の予定」

export type RoutineExerciseCategoryRow = {
  routineId: number;
  category: string;
  orderIndex: number;
};

// 1ルーティンにつき代表カテゴリを1つ決める（種目数最多、タイはorderIndexが最小=先に追加した種目）
export function pickRoutineRepresentativeCategories(rows: RoutineExerciseCategoryRow[]): Map<number, string> {
  const byRoutine = new Map<number, Map<string, { count: number; minOrderIndex: number }>>();

  for (const row of rows) {
    let counts = byRoutine.get(row.routineId);
    if (!counts) {
      counts = new Map();
      byRoutine.set(row.routineId, counts);
    }
    const existing = counts.get(row.category);
    if (existing) {
      existing.count += 1;
      existing.minOrderIndex = Math.min(existing.minOrderIndex, row.orderIndex);
    } else {
      counts.set(row.category, { count: 1, minOrderIndex: row.orderIndex });
    }
  }

  const result = new Map<number, string>();
  for (const [routineId, counts] of byRoutine) {
    let best: string | undefined;
    let bestCount = -1;
    let bestOrderIndex = Infinity;
    for (const [category, { count, minOrderIndex }] of counts) {
      const isBetter = count > bestCount || (count === bestCount && minOrderIndex < bestOrderIndex);
      if (best === undefined || isBetter) {
        best = category;
        bestCount = count;
        bestOrderIndex = minOrderIndex;
      }
    }
    result.set(routineId, best!);
  }
  return result;
}

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
