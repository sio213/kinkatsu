import { db } from '@/db/client';
import { reminders } from '@/db/schema';
import { useRoutineExerciseSummaries } from '@/hooks/use-routines';
import { aggregateSchedulePrimaryCategoryByDay, type ScheduleFireRow } from '@/lib/calendar/schedule';
import { aggregateDailyCategorySet } from '@/lib/calendar/day-category';
import { toDateKey } from '@/lib/calendar/date-grid';
import { getFireDatesInRange, parseReminder } from '@/lib/notifications/scheduler';
import { and, eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type CalendarMonthSchedule = {
  // 日付キー(YYYY-MM-DD)→予定の代表カテゴリ。ルーティン紐付きリマインダー（単体リマインダーは
  // 対象外、2026-07-19確定）が発火する日だけキーを持つ。同日に複数予定があれば最も早い時刻の
  // ものを代表にする（lib/calendar/schedule.ts参照）
  primaryCategoryByScheduleDay: Map<string, string>;
  // 日付キー→その日に予定がある全カテゴリの集合。カテゴリフィルター中の判定に使う
  categorySetByScheduleDay: Map<string, Set<string>>;
};

// カレンダーの月グリッド用。[todayStart, rangeEnd)の範囲でルーティン紐付き・有効な
// リマインダーが発火する日を日付ごとに集計する。todayStart未満（過去日）は対象外
// （過去日は実績のみを表示する、use-calendar-month-records.tsの担当）。
// 「ルーティンの代表カテゴリ」は既存のuseRoutineExerciseSummaries（ルーティン一覧カードの
// 「N種目」「カテゴリタグ」と同じ集計。種目数最多、タイは種目追加順）をそのまま流用する
// （カテゴリ集計を個別に持つと画面ごとに順序基準がズレるため。以前はrouteExercises/exercises
// までJOINして自前集計していたが、この流用に一本化した）
export function useCalendarMonthSchedule(rangeStart: number, rangeEnd: number, todayStart: number): CalendarMonthSchedule {
  const summaries = useRoutineExerciseSummaries();

  const { data } = useLiveQuery(
    db.select().from(reminders).where(and(eq(reminders.enabled, true), isNotNull(reminders.routineId))),
  );

  return useMemo(() => {
    const rows = data ?? [];
    if (rows.length === 0) {
      return { primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() };
    }

    const effectiveStart = Math.max(rangeStart, todayStart);
    const effectiveStartDate = new Date(effectiveStart);
    const rangeEndDate = new Date(rangeEnd);

    const fireRows: ScheduleFireRow[] = [];
    for (const r of rows) {
      // 種目が1件も無いルーティンはsummariesにエントリを持たず、代表カテゴリを
      // 決められないため表示対象外になる（意図した挙動）
      const category = summaries.get(r.routineId!)?.categories[0];
      if (category === undefined) continue;
      let fireDates: Date[];
      try {
        fireDates = getFireDatesInRange(parseReminder(r), effectiveStartDate, rangeEndDate);
      } catch {
        continue;
      }
      for (const fireDate of fireDates) {
        fireRows.push({ dateKey: toDateKey(fireDate), hour: fireDate.getHours(), minute: fireDate.getMinutes(), category });
      }
    }

    return {
      primaryCategoryByScheduleDay: aggregateSchedulePrimaryCategoryByDay(fireRows),
      categorySetByScheduleDay: aggregateDailyCategorySet(fireRows),
    };
  }, [data, summaries, rangeStart, rangeEnd, todayStart]);
}
