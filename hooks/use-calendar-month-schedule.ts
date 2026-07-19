import { db } from '@/db/client';
import { reminderScheduleSkips, reminders, scheduledWorkouts } from '@/db/schema';
import { useRoutineExerciseSummaries } from '@/hooks/use-routines';
import {
  aggregateSchedulePrimaryCategoryByDay,
  buildReminderSkipKey,
  buildReminderSkipSet,
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
  // 対象外、2026-07-19確定）または手動予定（PR10）が発火/存在する日だけキーを持つ。同日に
  // 複数予定があれば最も早い時刻のものを代表にする（lib/calendar/schedule.ts参照）
  primaryCategoryByScheduleDay: Map<string, string>;
  // 日付キー→その日に予定がある全カテゴリの集合。カテゴリフィルター中の判定に使う
  categorySetByScheduleDay: Map<string, Set<string>>;
};

// カレンダーの月グリッド用。[todayStart, rangeEnd)の範囲でルーティン紐付き・有効な
// リマインダーが発火する日、および手動予定（scheduledWorkouts、PR10）がある日を
// 日付ごとに集計する。todayStart未満（過去日）は対象外
// （過去日は実績のみを表示する、use-calendar-month-records.tsの担当）。
// 「ルーティンの代表カテゴリ」は既存のuseRoutineExerciseSummaries（ルーティン一覧カードの
// 「N種目」「カテゴリタグ」と同じ集計。種目数最多、タイは種目追加順）をそのまま流用する
// （カテゴリ集計を個別に持つと画面ごとに順序基準がズレるため。以前はrouteExercises/exercises
// までJOINして自前集計していたが、この流用に一本化した）
export function useCalendarMonthSchedule(rangeStart: number, rangeEnd: number, todayStart: number): CalendarMonthSchedule {
  const summaries = useRoutineExerciseSummaries();

  const { data: reminderRows } = useLiveQuery(
    db.select().from(reminders).where(and(eq(reminders.enabled, true), isNotNull(reminders.routineId))),
  );
  // 日付でのSQL絞り込みはしない(hooks/use-calendar-day-manual-schedule.tsと同じ理由。
  // useLiveQueryの再購読はdeps([]固定)でしか効かず、月送りでrangeStart/rangeEndが変わっても
  // 再購読されないため、範囲での絞り込みは下のuseMemo側で行う)
  const { data: manualRows } = useLiveQuery(db.select().from(scheduledWorkouts));
  const { data: skipRows } = useLiveQuery(db.select().from(reminderScheduleSkips));

  return useMemo(() => {
    const rows = reminderRows ?? [];
    const manuals = manualRows ?? [];
    const skips = skipRows ?? [];
    if (rows.length === 0 && manuals.length === 0) {
      return { primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() };
    }

    const effectiveStart = Math.max(rangeStart, todayStart);
    const effectiveStartDate = new Date(effectiveStart);
    const rangeEndDate = new Date(rangeEnd);
    // 手動予定はDate計算(getFireDatesInRange)を経由しないため、同じ[effectiveStart, rangeEnd)を
    // 文字列のdateKeyで表した境界と比較する（'YYYY-MM-DD'はゼロ埋め済みなので文字列比較で日付順と一致する）
    const effectiveStartKey = toDateKey(effectiveStartDate);
    const rangeEndKey = toDateKey(rangeEndDate);
    const skipSet = buildReminderSkipSet(skips);

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
        const dateKey = toDateKey(fireDate);
        // 「今回だけスキップ」(PR10-6a)された日は月グリッドのリング/ドットにも反映させない
        if (skipSet.has(buildReminderSkipKey(r.id, dateKey))) continue;
        fireRows.push({ dateKey, hour: fireDate.getHours(), minute: fireDate.getMinutes(), category });
      }
    }
    for (const m of manuals) {
      if (m.scheduledDate < effectiveStartKey || m.scheduledDate >= rangeEndKey) continue;
      // hooks/use-calendar-day-manual-schedule.tsの選択日パネル側は種目0件のルーティンでも
      // {exerciseCount:0, categories:[]}にフォールバックしてカードを表示するが、こちらは
      // 月グリッドのリング/ドットの「色」を決めるための集計であり、そもそも塗る色が無いため
      // フォールバックできない（意図した非対称。日パネルには出るが月グリッドには出ない）
      const category = summaries.get(m.routineId)?.categories[0];
      if (category === undefined) continue;
      fireRows.push({ dateKey: m.scheduledDate, hour: m.hour, minute: m.minute, category });
    }

    return {
      primaryCategoryByScheduleDay: aggregateSchedulePrimaryCategoryByDay(fireRows),
      categorySetByScheduleDay: aggregateDailyCategorySet(fireRows),
    };
  }, [reminderRows, manualRows, skipRows, summaries, rangeStart, rangeEnd, todayStart]);
}
