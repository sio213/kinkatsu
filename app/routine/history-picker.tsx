import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { ExerciseHistoryPickerView } from '@/components/workout/exercise-history-picker-view';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { historySetsToDraftSets } from '@/lib/routines/validation';
import { NO_SESSION_TO_EXCLUDE, type HistoryEntry } from '@/lib/workout/history';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

// app/workout/history-picker.tsxのルーティン版。一覧・自己ベスト判定・確認ダイアログの実体は
// components/workout/exercise-history-picker-view.tsx（workout版と共通）にあり、ここでは
// 「進行中セッションが無い」ことを表す番兵値の指定と、選択結果を下書きストアへ反映する処理だけを担う。
// DB書き込みが無い同期処理のため実際には失敗しないが、エラー時のAlertは共通ビュー側が持つ
export default function RoutineHistoryPickerScreen() {
  const {
    index: indexParam,
    exerciseId: exerciseIdParam,
    exerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    index: string;
    exerciseId: string;
    exerciseName: string;
    hasRecordedData: string;
  }>();
  const index = Number(indexParam);
  const exerciseId = Number(exerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();
  const loadSetsIntoExerciseAt = useRoutineDraftStore((state) => state.loadSetsIntoExerciseAt);

  // 下書きストアへの更新は同期処理だが、共通ビューのonLoad契約(Promise<void>)と、
  // 他のルーティン側画面(exercise-swap.tsx・session-history-load.tsx)の書き方に合わせてasyncで宣言する
  const handleLoad = useCallback(
    async (entry: HistoryEntry) => {
      // getExerciseHistoryEntriesはカード単位(✓確定セットが1件以上あるか)でしか絞り込まないため、
      // entry.setsには値が1つも無い行(セット追加だけして未入力のまま終えた等)が混ざりうる。
      // historySetsToDraftSets(session-history-load.tsxと共用)で絞り込んでから読み込む
      // (絞り込まないと余分な空セットがテンプレートに混入してしまう)
      loadSetsIntoExerciseAt(index, historySetsToDraftSets(entry.sets));
      router.back();
    },
    [index, loadSetsIntoExerciseAt, router],
  );

  if (!Number.isFinite(index) || !Number.isFinite(exerciseId)) {
    return (
      <NotFoundScreen message="種目が見つかりません" onPressBack={() => router.back()} />
    );
  }

  return (
    <ExerciseHistoryPickerView
      exerciseId={exerciseId}
      exerciseName={exerciseName}
      // ルーティンには「進行中セッション」の概念が無いため、除外対象は無いことを表す番兵値を渡し、
      // 全ての実績を対象にする
      excludeSessionId={NO_SESSION_TO_EXCLUDE}
      hasRecordedData={hasRecordedData}
      confirmMessage="設定済みのセット内容は失われます。"
      onPressBack={() => router.back()}
      onLoad={handleLoad}
    />
  );
}
