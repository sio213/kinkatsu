import { ScheduleExerciseCardGroup } from '@/components/calendar/schedule-exercise-card-group';
import { useRoutinePreviewExerciseCards } from '@/hooks/use-routine-preview-exercise-cards';
import { hasAnyValue } from '@/lib/workout/set-values';
import { memo, useMemo } from 'react';

type Props = {
  routineId: number;
  routineName: string;
  sessionStartedAt: number;
  // 今日自身の予定にのみ渡す
  onPressStart?: () => void;
  // 未実体化のため、タップ時にmaterializeReminderOccurrence（DB書き込み+遷移）を行う想定。
  // 呼び出し元（app/(tabs)/calendar.tsx）が非同期処理・二重タップ防止・エラーハンドリングの
  // 責務を持つ（このコンポーネント自身はUIのみ）
  onPress: () => void;
};

// まだ実体化(materializeReminderOccurrence、lib/notifications/scheduled-workout-scheduler.ts)して
// いないリマインダー予定の選択日パネル表示（2026-07-21）。scheduledWorkoutIdを持たないため、
// useScheduledExerciseCardsではなくuseRoutinePreviewExerciseCardsでルーティン本体の現在の
// 中身をライブ表示する。目標セットは「ルーティン本体の実際の値」そのものであり、
// scheduledWorkoutSetsのような「未設定」概念が無いため、値があるセットは全てconfirmedSets
// 扱いにするためのセンチネルとしてcompletedAt: 0を付与する（hooks/use-scheduled-exercise-cards.ts
// のtargetSets判定と同じ理由）。このフックは'error'状態を持たないためonRetryCardsは渡さない
export const ReminderScheduleExerciseGroup = memo(function ReminderScheduleExerciseGroup({
  routineId,
  routineName,
  sessionStartedAt,
  onPressStart,
  onPress,
}: Props) {
  const { exercises, loaded } = useRoutinePreviewExerciseCards(routineId);
  // useScheduledExerciseCards（hooks/use-scheduled-exercise-cards.ts:107）と同じくhasAnyValueで
  // 全カラムnullの空セット行を除外してからセンチネルを付与する（@reviewer指摘: フィルタが無いと
  // 「値の無い空セット行」を持つルーティンで、実体化前(プレビュー)は「1セット」と表示され、
  // タップして実体化した後は「実施記録なし」に変わってしまい、この改修が統一しようとしている
  // 当の見た目が割れる）。cards変換自体もuseMemoに包み、ScheduleExerciseCardGroup(memo)が
  // 毎レンダー新しい配列参照で再描画される事故を防ぐ（@reviewer指摘）
  const cards = useMemo(
    () =>
      loaded
        ? exercises.map((exercise) => ({
            key: String(exercise.routineExerciseId),
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            category: exercise.category,
            source: exercise.source,
            slug: exercise.slug,
            measurementType: exercise.measurementType,
            sets: exercise.sets.filter(hasAnyValue).map((set) => ({ ...set, completedAt: 0 })),
          }))
        : null,
    [exercises, loaded],
  );

  return (
    <ScheduleExerciseCardGroup
      routineName={routineName}
      sessionStartedAt={sessionStartedAt}
      title={routineName}
      cards={cards}
      onPressStart={onPressStart}
      onPress={onPress}
    />
  );
});
