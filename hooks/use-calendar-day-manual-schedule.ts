import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { useCalendarDirectScheduleSummaries } from '@/hooks/use-calendar-direct-schedule-summaries';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
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
  // 直接予定（routineId===null）のときだけ、種目一覧カード表示（DirectScheduleExerciseGroup）・
  // 編集画面への遷移時の事前選択に使う（選択順=orderIndex順）
  exerciseIds?: number[];
};

// カレンダーの選択日パネル用。手動追加した予定（PR10、リマインダーとは無関係）を選択日ちょうどの
// 分だけ返す。ルーティン名・カテゴリ・種目数はhooks/use-calendar-day-schedule.tsと同じく
// 既存のuseRoutines/useRoutineExerciseSummariesに委譲する（画面ごとに集計基準がズレないように）。
// 「直接追加」予定（routineIdがnull、2026-07-20）はuseCalendarDirectScheduleSummariesに委譲する
//
// 日付での絞り込みはuseLiveQuery側ではなくJS側(useMemo)で行う。useLiveQueryの再購読は
// 第2引数のdeps([]固定)でしか効かず、SQLのWHEREにselectedDate由来の値を挟んでもそこだけを
// 変えて再購読されることは無い（use-calendar-day-schedule.tsと同じ理由でJS側フィルタに揃える）
export function useCalendarDayManualSchedule(selectedDate: Date): ManualScheduleCard[] {
  const summaries = useRoutineExerciseSummaries();
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

      if (r.routineId != null) {
        const routineName = routineNameById.get(r.routineId);
        // 削除済みルーティンを指す予定（安全網、通常はcascadeで一緒に消える）は名前を
        // 決められず対象外。種目0件のルーティンはschedule-routine-picker.tsx側で選択できて
        // しまう（workout/routine-picker.tsxと同じ「0種目でも選べる」仕様）ため、ここで
        // summary無しを除外すると「選べたのに選択日パネルへ永久に表示されない」予定が
        // 生まれてしまう。summaryが無ければ0種目・カテゴリ無しにフォールバックして表示する
        if (routineName === undefined) continue;
        const summary = summaries.get(r.routineId) ?? { exerciseCount: 0, categories: [] };
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
        // 直接追加はaddDirectScheduledWorkoutが種目0件を弾いており、参照する種目も
        // onDelete:'restrict'で削除できないため通常summaryは必ず見つかるが、
        // 安全網として見つからない場合は対象外にする
        const summary = directSummaries.get(r.id);
        if (summary === undefined || summary.exerciseNames.length === 0) continue;
        cards.push({
          scheduledWorkoutId: r.id,
          routineId: null,
          title: formatDirectScheduleTitle(summary.exerciseNames),
          categories: summary.categories,
          exerciseCount: summary.exerciseCount,
          hour: r.hour,
          minute: r.minute,
          exerciseIds: summary.exerciseIds,
        });
      }
    }

    return cards.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
    // selectedDateはDateオブジェクトのため参照が毎回変わり得る。実際に意味を持つのは
    // 年月日のみなのでtoDateKeyで安定した依存値にする（use-calendar-day-schedule.tsと同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, summaries, directSummaries, routines, toDateKey(selectedDate)]);
}
