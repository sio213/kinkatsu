import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { useCalendarDirectScheduleSummaries } from '@/hooks/use-calendar-direct-schedule-summaries';
import { useRoutines } from '@/hooks/use-routines';
import { formatDirectScheduleTitle } from '@/lib/calendar/schedule';
import { toDateKey } from '@/lib/calendar/date-grid';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type ManualScheduleCard = {
  scheduledWorkoutId: number;
  // ルーティンから追加した予定はnumber、「直接追加」予定（2026-07-20）はnull
  routineId: number | null;
  // ルーティン予定はルーティン名、直接予定はformatDirectScheduleTitleで合成した種目名
  title: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
};

// カレンダーの選択日パネル用。手動追加した予定（PR10、リマインダーとは無関係）を選択日ちょうどの
// 分だけ返す。ルーティン名はuseRoutinesから引くが、カテゴリ・種目数はルーティン紐付き・
// 「直接追加」（routineIdがnull、2026-07-20）のどちらもuseCalendarDirectScheduleSummaries
// （scheduledWorkoutExercises、このインスタンス自身の中身）から取る。ルーティン紐付き予定も
// addScheduledWorkout時点でルーティンの種目をこのテーブルへコピーしており、以後は
// schedule-workout-edit.tsxでこのインスタンス単位で編集される（2026-07-21統一）ため、
// ルーティン本体(useRoutineExerciseSummaries)を参照するとカード編集の内容が反映されない
// バグになる（@ユーザー指摘で発覚、2026-07-21修正）
//
// 日付での絞り込みはuseLiveQuery側ではなくJS側(useMemo)で行う。useLiveQueryの再購読は
// 第2引数のdeps([]固定)でしか効かず、SQLのWHEREにselectedDate由来の値を挟んでもそこだけを
// 変えて再購読されることは無い（use-calendar-day-schedule.tsと同じ理由でJS側フィルタに揃える）
export function useCalendarDayManualSchedule(selectedDate: Date): ManualScheduleCard[] {
  const directSummaries = useCalendarDirectScheduleSummaries();
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

      // 種目0件（addDirectScheduledWorkoutは作成時点で弾いているが、schedule-workout-edit.tsx
      // 側の⋮「削除」で最後の1件まで削除できる、2026-07-22、@ユーザー指摘で安全網を撤廃）の
      // 予定はuseCalendarDirectScheduleSummaries（innerJoin集計）にキー自体が存在しない。
      // ここでcontinueすると、カード自体が選択日パネルから消えて二度と辿り着けなくなる
      // （@designer指摘: 実際に発生するバグだった）ため、0件・カテゴリ無しにフォールバックする
      const summary = directSummaries.get(r.id) ?? { exerciseCount: 0, categories: [], exerciseNames: [] };

      if (r.routineId != null) {
        const routineName = routineNameById.get(r.routineId);
        // 削除済みルーティンを指す予定（安全網、通常はcascadeで一緒に消える）は名前を
        // 決められず対象外
        if (routineName === undefined) continue;
        cards.push({
          scheduledWorkoutId: r.id,
          routineId: r.routineId,
          title: routineName,
          categories: summary.categories,
          exerciseCount: summary.exerciseCount,
          hour: r.hour,
          minute: r.minute,
        });
      } else {
        cards.push({
          scheduledWorkoutId: r.id,
          routineId: null,
          title: formatDirectScheduleTitle(summary.exerciseNames),
          categories: summary.categories,
          exerciseCount: summary.exerciseCount,
          hour: r.hour,
          minute: r.minute,
        });
      }
    }

    return cards.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
    // selectedDateはDateオブジェクトのため参照が毎回変わり得る。実際に意味を持つのは
    // 年月日のみなのでtoDateKeyで安定した依存値にする（use-calendar-day-schedule.tsと同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, directSummaries, routines, toDateKey(selectedDate)]);
}
