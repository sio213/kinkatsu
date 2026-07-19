import { db } from '@/db/client';
import { reminderScheduleSkips, reminders, type Reminder } from '@/db/schema';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { buildReminderSkipKey, buildReminderSkipSet } from '@/lib/calendar/schedule';
import { toDateKey } from '@/lib/calendar/date-grid';
import { getFireDatesInRange, parseReminder } from '@/lib/notifications/scheduler';
import { and, eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type DayScheduleCard = {
  reminderId: number;
  routineId: number;
  routineName: string;
  // 種目数が多い順（既存のuseRoutineExerciseSummaries、ルーティン一覧カードと同じ並び順基準に
  // 揃えている。同じルーティンなのに画面ごとにチップの並びが違って見えることを避けるため）
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
  // 頻度表示(lib/notifications/format.tsのformatKindSummary)に必要な生のリマインダー行。
  // 「今日」の場合は呼び出し側でformatKindSummaryの代わりに「今日 HH:MM」表記に差し替える
  reminder: Reminder;
};

// 「今回だけスキップ」(PR10-6a)で打ち消された、選択日のリマインダー予定。ゴーストカード
// （取り消し線+「元に戻す」）の表示に必要な最小限の情報のみ持つ（カテゴリ・種目数は
// ゴースト表示では使わないためDayScheduleCardより軽量）
export type SkippedReminderCard = {
  reminderId: number;
  routineId: number;
  routineName: string;
  hour: number;
  minute: number;
};

export type DaySchedule = {
  cards: DayScheduleCard[];
  skipped: SkippedReminderCard[];
};

// カレンダーの選択日パネル用。selectedDateの0時〜翌0時ちょうどに発火するルーティン紐付き・
// 有効なリマインダーだけをカードとして返す（単体リマインダーは対象外、use-calendar-month-schedule.ts
// と同じ2026-07-19確定の仕様）。時刻順に並べる。過去日に対して呼んでも発火自体は計算されてしまう
// ため、「過去日には予定を表示しない」判断は呼び出し側(app/(tabs)/calendar.tsx)の責務とする
// （このフック自体は日付の前後関係を知らない）。
// ルーティン名・カテゴリ・種目数は既存のuseRoutines/useRoutineExerciseSummaries（ルーティン
// 一覧カードと同じ集計）をそのまま流用し、reminders単体のクエリと組み合わせる
// （以前はroutines/routineExercises/exercisesまでJOINして自前集計していたが、この流用に一本化した）。
// 発火するが打ち消し済み(reminderScheduleSkips、PR10-6a)のものはcardsから除きskippedへ回す
export function useCalendarDaySchedule(selectedDate: Date): DaySchedule {
  const summaries = useRoutineExerciseSummaries();
  const { routines } = useRoutines();

  const { data } = useLiveQuery(
    db.select().from(reminders).where(and(eq(reminders.enabled, true), isNotNull(reminders.routineId))),
  );
  const { data: skipRows } = useLiveQuery(db.select().from(reminderScheduleSkips));

  return useMemo(() => {
    const rows = data ?? [];
    const skips = skipRows ?? [];
    if (rows.length === 0) return { cards: [], skipped: [] };

    const routineNameById = new Map(routines.map((r) => [r.id, r.name] as const));
    const skipSet = buildReminderSkipSet(skips);

    const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dateKey = toDateKey(selectedDate);

    const cards: DayScheduleCard[] = [];
    const skipped: SkippedReminderCard[] = [];
    for (const r of rows) {
      const summary = summaries.get(r.routineId!);
      const routineName = routineNameById.get(r.routineId!);
      // 種目が1件も無いルーティンや、削除済みルーティンを指すリマインダー（安全網、通常は
      // ルーティン削除時にリマインダーも先に消える）は代表カテゴリ/名前を決められず対象外
      if (!summary || routineName === undefined) continue;

      let fires = false;
      try {
        fires = getFireDatesInRange(parseReminder(r), dayStart, dayEnd).length > 0;
      } catch {
        continue;
      }
      if (!fires) continue;

      if (skipSet.has(buildReminderSkipKey(r.id, dateKey))) {
        skipped.push({ reminderId: r.id, routineId: r.routineId!, routineName, hour: r.hour, minute: r.minute });
        continue;
      }

      cards.push({
        reminderId: r.id,
        routineId: r.routineId!,
        routineName,
        categories: summary.categories,
        exerciseCount: summary.exerciseCount,
        hour: r.hour,
        minute: r.minute,
        reminder: r,
      });
    }

    return {
      cards: cards.sort((a, b) => a.hour - b.hour || a.minute - b.minute),
      // ゴーストカードもcardsと同じ時刻順に揃える(@designer指摘: 未ソートだとクエリ返却順のまま
      // バラバラに並んでしまう)
      skipped: skipped.sort((a, b) => a.hour - b.hour || a.minute - b.minute),
    };
    // selectedDateはDateオブジェクトのため参照が毎回変わり得る。実際に意味を持つのは
    // 年月日のみなのでtoDateKeyで安定した依存値にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, skipRows, summaries, routines, toDateKey(selectedDate)]);
}
