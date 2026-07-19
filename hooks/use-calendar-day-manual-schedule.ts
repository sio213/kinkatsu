import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { toDateKey } from '@/lib/calendar/date-grid';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type ManualScheduleCard = {
  scheduledWorkoutId: number;
  routineId: number;
  routineName: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
};

// カレンダーの選択日パネル用。手動追加した予定（PR10、リマインダーとは無関係）を選択日ちょうどの
// 分だけ返す。ルーティン名・カテゴリ・種目数はhooks/use-calendar-day-schedule.tsと同じく
// 既存のuseRoutines/useRoutineExerciseSummariesに委譲する（画面ごとに集計基準がズレないように）
//
// 日付での絞り込みはuseLiveQuery側ではなくJS側(useMemo)で行う。useLiveQueryの再購読は
// 第2引数のdeps([]固定)でしか効かず、SQLのWHEREにselectedDate由来の値を挟んでもそこだけを
// 変えて再購読されることは無い（use-calendar-day-schedule.tsと同じ理由でJS側フィルタに揃える）
export function useCalendarDayManualSchedule(selectedDate: Date): ManualScheduleCard[] {
  const summaries = useRoutineExerciseSummaries();
  const { routines } = useRoutines();

  const { data } = useLiveQuery(db.select().from(scheduledWorkouts));

  return useMemo(() => {
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const dateKey = toDateKey(selectedDate);
    const routineNameById = new Map(routines.map((r) => [r.id, r.name] as const));

    const cards: ManualScheduleCard[] = [];
    for (const r of rows) {
      if (r.scheduledDate !== dateKey) continue;
      const summary = summaries.get(r.routineId);
      const routineName = routineNameById.get(r.routineId);
      // 種目が1件も無いルーティンや、削除済みルーティンを指す予定（安全網、通常はcascadeで
      // 一緒に消える）は代表カテゴリ/名前を決められず対象外
      if (!summary || routineName === undefined) continue;

      cards.push({
        scheduledWorkoutId: r.id,
        routineId: r.routineId,
        routineName,
        categories: summary.categories,
        exerciseCount: summary.exerciseCount,
        hour: r.hour,
        minute: r.minute,
      });
    }

    return cards.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
    // selectedDateはDateオブジェクトのため参照が毎回変わり得る。実際に意味を持つのは
    // 年月日のみなのでtoDateKeyで安定した依存値にする（use-calendar-day-schedule.tsと同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, summaries, routines, toDateKey(selectedDate)]);
}
