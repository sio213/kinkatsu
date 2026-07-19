import { db } from '@/db/client';
import { exercises, reminders, routineExercises, type Reminder } from '@/db/schema';
import {
  aggregateSchedulePrimaryCategoryByDay,
  pickRoutineRepresentativeCategories,
  type RoutineExerciseCategoryRow,
  type ScheduleFireRow,
} from '@/lib/calendar/schedule';
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
// reminders起点の1クエリでrouteExercises/exercisesまでJOINし、そのJOIN結果から
// 「ルーティンの代表カテゴリ」と「リマインダー本体（発火日時計算用）」の両方を導出する。
// 種目が1件も無いルーティン（routine_exercisesが空）に紐づくリマインダーは、inner joinで
// 行ごと消えて代表カテゴリを決められないため表示対象外になる（意図した挙動）
export function useCalendarMonthSchedule(rangeStart: number, rangeEnd: number, todayStart: number): CalendarMonthSchedule {
  // useLiveQueryはfrom()に指定したテーブル(reminders)の変更しか自動購読しない
  // （use-calendar-month-records.tsと同じ既知の制約）。ルーティン編集画面で種目を
  // 追加・削除・並び替えしてカレンダーに戻ると、routineExercises側の変更が
  // メインクエリに伝播せず代表カテゴリが古いままになるため、routineExercises単体の
  // 軽量な購読を追加し、その結果をdepsに含めて再購読・再フェッチを強制する
  const { data: routineExercisesSignal } = useLiveQuery(
    db.select({ id: routineExercises.id, routineId: routineExercises.routineId }).from(routineExercises),
  );

  const { data } = useLiveQuery(
    db
      .select({
        id: reminders.id,
        routineId: reminders.routineId,
        title: reminders.title,
        body: reminders.body,
        kind: reminders.kind,
        hour: reminders.hour,
        minute: reminders.minute,
        weekdays: reminders.weekdays,
        monthdays: reminders.monthdays,
        anchorDate: reminders.anchorDate,
        intervalDays: reminders.intervalDays,
        intervalMonths: reminders.intervalMonths,
        nthWeek: reminders.nthWeek,
        nthWeekdays: reminders.nthWeekdays,
        enabled: reminders.enabled,
        createdAt: reminders.createdAt,
        updatedAt: reminders.updatedAt,
        exerciseCategory: exercises.category,
        exerciseOrderIndex: routineExercises.orderIndex,
      })
      .from(reminders)
      .innerJoin(routineExercises, eq(routineExercises.routineId, reminders.routineId))
      .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
      .where(and(eq(reminders.enabled, true), isNotNull(reminders.routineId))),
    [routineExercisesSignal],
  );

  return useMemo(() => {
    const rows = data ?? [];
    if (rows.length === 0) {
      return { primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() };
    }

    const categoryRows: RoutineExerciseCategoryRow[] = rows.map((r) => ({
      routineId: r.routineId!,
      category: r.exerciseCategory,
      orderIndex: r.exerciseOrderIndex,
    }));
    const representativeByRoutine = pickRoutineRepresentativeCategories(categoryRows);

    // 1リマインダーにつき種目数分の行が重複するので、リマインダー単位に間引く
    // （発火日時の計算はリマインダー1件につき1回でよいため）。JOIN由来の
    // exerciseCategory/exerciseOrderIndexを含んだままparseReminderに渡すと
    // ParsedReminderの型と実体がズレるため、reminder列だけの素のオブジェクトに絞る
    const uniqueReminders = new Map<number, Reminder>();
    for (const r of rows) {
      if (uniqueReminders.has(r.id)) continue;
      const {
        id, routineId, title, body, kind, hour, minute, weekdays, monthdays,
        anchorDate, intervalDays, intervalMonths, nthWeek, nthWeekdays, enabled, createdAt, updatedAt,
      } = r;
      uniqueReminders.set(id, {
        id, routineId, title, body, kind, hour, minute, weekdays, monthdays,
        anchorDate, intervalDays, intervalMonths, nthWeek, nthWeekdays, enabled, createdAt, updatedAt,
      });
    }

    const effectiveStart = Math.max(rangeStart, todayStart);
    const effectiveStartDate = new Date(effectiveStart);
    const rangeEndDate = new Date(rangeEnd);

    const fireRows: ScheduleFireRow[] = [];
    for (const r of uniqueReminders.values()) {
      const category = representativeByRoutine.get(r.routineId!);
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
  }, [data, rangeStart, rangeEnd, todayStart]);
}
