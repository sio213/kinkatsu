import { ScheduleExerciseCardGroup } from '@/components/calendar/schedule-exercise-card-group';
import { useScheduledExerciseCards } from '@/hooks/use-scheduled-exercise-cards';
import { memo, useMemo } from 'react';

type Props = {
  scheduledWorkoutId: number;
  // ルーティン紐付き予定（手動追加・実体化済みのリマインダー予定）のときだけ呼び出し元が渡す。
  // 直接予定（個別種目選択、routineId===null）はルーティン名に相当するものが無いため渡さない
  routineName?: string;
  sessionStartedAt: number;
  title: string;
  // 今日自身の予定にのみ渡す
  onPressStart?: () => void;
  onPress: () => void;
};

// scheduledWorkoutId実体を持つ予定（直接予定、および実体化済みのルーティン予定）共通の
// 選択日パネル表示（2026-07-21、旧DirectScheduleExerciseGroupを一般化）。
// useScheduledExerciseCardsの結果をScheduleExerciseCardGroupの共通カード形に変換するだけの
// 薄いコンテナ。実体化済みルーティン予定はこの予定インスタンス専用にコピーされた
// scheduledWorkoutExercises/scheduledWorkoutSetsを編集するため、ルーティン本体には影響しない
// （lib/calendar/scheduled-workouts.tsのaddScheduledWorkout、PR1で対応済み）。⋮メニュー
// （削除）は持たない（2026-07-22、@ユーザー指摘）。カードタップ先の目標セット編集画面
// (schedule-workout-edit.tsx)自身が⋮「削除」を持つため、ここに重複して置く必要が無い
export const ScheduledWorkoutExerciseGroup = memo(function ScheduledWorkoutExerciseGroup({
  scheduledWorkoutId,
  routineName,
  sessionStartedAt,
  title,
  onPressStart,
  onPress,
}: Props) {
  const { cards: rawCards, retry } = useScheduledExerciseCards(scheduledWorkoutId);
  // 変換をuseMemoに包み、ScheduleExerciseCardGroup(memo)が毎レンダー新しい配列参照で
  // 再描画される事故を防ぐ（@reviewer指摘）。scheduledWorkoutExerciseIdは分解代入で落とし、
  // 呼び出し先の型に無いフィールドが余分に残らないようにする
  const cards = useMemo(
    () =>
      rawCards === 'error' || rawCards === null
        ? rawCards
        : rawCards.map(({ scheduledWorkoutExerciseId, ...card }) => ({ key: String(scheduledWorkoutExerciseId), ...card })),
    [rawCards],
  );

  return (
    <ScheduleExerciseCardGroup
      routineName={routineName}
      sessionStartedAt={sessionStartedAt}
      title={title}
      cards={cards}
      onRetryCards={retry}
      onPressStart={onPressStart}
      onPress={onPress}
    />
  );
});
