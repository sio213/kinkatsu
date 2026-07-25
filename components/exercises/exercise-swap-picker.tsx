import { ExerciseSelectView } from '@/components/exercises/exercise-select-view';
import { HeaderTitle } from '@/components/ui/header-title';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenStyles } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useExercises } from '@/hooks/use-exercises';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  currentExerciseId: number;
  currentExerciseName: string;
  hasRecordedData: boolean;
  // 実績集計から除外するセッション(呼び出し時点で編集中のセッション)。ルーティン編集には
  // セッションの概念が無いため、その場合はundefinedのまま渡す(除外対象なし)
  usageStatsExcludeSessionId?: number;
  // 入れ替え確定時の確認ダイアログ本文。「入力済みの記録」(トレーニング中)/「設定済みのセット内容」
  // (ルーティン編集)など、失われる対象の呼び方が呼び出し元の文脈で違うため引数化する
  confirmMessage: string;
  // 実際の永続化(DB書き込み/ルーティン下書き配列の更新)と成功時のrouter.back()は呼び出し側の責務。
  // 失敗時はthrowするだけでよく、二重送信防止・エラーAlert表示はこのコンポーネントが担う
  onSubmit: (exercise: Exercise) => Promise<void>;
};

// app/workout/exercise-swap.tsx・app/routine/exercise-swap.tsx・
// app/calendar/schedule-workout-exercise-swap.tsxで共有する「種目を入れ替え」画面の本体。
// 検索/カテゴリ絞り込み/並び替え/一覧の描画はExerciseSelectView（種目追加ピッカーと共通）に
// 委ね、ここは単一選択・確認ダイアログ・エラーハンドリングと、実際にどこへ反映するかの
// 呼び出し側への委譲を担う
export function ExerciseSwapPicker({
  currentExerciseId,
  currentExerciseName,
  hasRecordedData,
  usageStatsExcludeSessionId,
  confirmMessage,
  onSubmit,
}: Props) {
  const { exercises } = useExercises();
  // 種目追加ピッカーと違い単一選択（1件だけ）のため、選択idはSetではなく単一の値で持つ。
  // ExerciseSelectViewへは0件か1件の配列として渡す
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIds = useMemo(() => (selectedId == null ? [] : [selectedId]), [selectedId]);
  const isSubmittingRef = useRef(false);

  const handleToggle = useCallback((id: number) => {
    Keyboard.dismiss();
    setSelectedId(id);
  }, []);

  const runSubmit = useCallback(
    async (exercise: Exercise) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      try {
        await onSubmit(exercise);
      } catch (e) {
        console.error('[exercise swap]', e);
        Alert.alert('エラー', '種目を入れ替えられませんでした。');
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [onSubmit],
  );

  const handleSubmit = useCallback(() => {
    // 選択済みidが検索・カテゴリ絞り込みで一覧から一時的に外れていても解決できるよう、
    // 絞り込み前の全種目一覧から探す（絞り込み後のリストだと無言で何も起きなくなるバグを避ける）
    const selected = exercises.find((e) => e.id === selectedId);
    if (!selected) return;
    // 入れ替え後は種目追加時と同じ状態（値が空の1セットのみ）にリセットされるため、
    // まだ何も記録していなければ失われるものが無く、確認なしで入れ替えてよい
    // （セット削除の確認要否と同じ考え方）
    if (!hasRecordedData) {
      runSubmit(selected);
      return;
    }
    Alert.alert(`「${selected.name}」に入れ替えますか？`, confirmMessage, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '入れ替える', style: 'destructive', onPress: () => runSubmit(selected) },
    ]);
  }, [exercises, selectedId, hasRecordedData, confirmMessage, runSubmit]);

  return (
    // 3つの呼び出し元はいずれも「フロー内の中間画面」としてルートStack上にあるため
    // edgesは['bottom']で固定してよい（ExerciseReorderViewと同じ判断）
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="種目を入れ替え" subtitle={currentExerciseName} />,
        }}
      />
      <ExerciseSelectView
        exercises={exercises}
        sortScope="swap"
        usageStatsExcludeSessionId={usageStatsExcludeSessionId}
        // 入れ替え先の候補から自分自身（現在の種目）は除く。選んでも差分が無いため
        excludeExerciseId={currentExerciseId}
        selectedIds={selectedIds}
        selectionMode="radio"
        onToggle={handleToggle}
        footer={<PrimaryButton label="入れ替える" onPress={handleSubmit} disabled={selectedId == null} />}
      />
    </SafeAreaView>
  );
}
