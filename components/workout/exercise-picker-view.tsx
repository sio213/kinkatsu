import { ExerciseSelectView } from '@/components/exercises/exercise-select-view';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useExercises } from '@/hooks/use-exercises';
import { useCallback, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';

type Props = {
  // トレーニング中セッションから開く場合、今まさに種目を追加している進行中セッションを
  // 実績集計から除外する（自分自身を「過去の実績」として参照しないため。詳細は
  // useExerciseUsageStatsのコメント参照）。ルーティン等セッションに紐づかない文脈では省略する
  excludeSessionId?: number;
  // 選択を確定したときに呼ばれる。選択順を保持した種目idの配列を渡す
  // （呼び出し側がDB追加・ドラフトストアへの反映など、文脈ごとの確定処理と、成功時の遷移を行う）。
  // 失敗時はthrowするだけでよく、二重送信防止・エラーAlertはこのコンポーネントが担う
  // （ExerciseSwapPickerのonSubmitと同じ契約。@reviewer指摘: 以前は逆に「全て呼び出し側の責務」
  // としていたため、3つの呼び出し元が同じisAddingRef・try/catch・同一文言のAlertを複製していた）
  onConfirm: (selectedIds: number[]) => Promise<void>;
};

// 種目追加ピッカーの複数選択と確定ボタン。検索/カテゴリ絞り込み/並び替え/一覧の描画は
// ExerciseSelectView（種目入れ替え画面と共通）に委ね、ここは「複数選べる」ことと
// 確定ボタンの見た目だけを持つ。
// app/workout/exercise-picker.tsx（トレーニング中セッションへの追加）・ルーティンの種目追加
// （下書きへの追加）・カレンダーの予定への追加から使う。sessionId依存の確定処理
// （addExercisesToSession呼び出し等）は持たず、呼び出し側にonConfirmで委譲する
export function ExercisePickerView({ excludeSessionId, onConfirm }: Props) {
  const { exercises } = useExercises();
  // 選択順を保持するため配列で管理する（Setだと挿入順の保証が実装依存になるため避ける）
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const isAddingRef = useRef(false);

  const handleToggle = useCallback((id: number) => {
    // 選択したら検索キーボードを閉じ、一覧を広く見せる
    // （確定ボタン自体はKeyboardAvoidingScreenでキーボードの上に出るため隠れない）
    Keyboard.dismiss();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existingId) => existingId !== id) : [...prev, id],
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    try {
      await onConfirm(selectedIds);
    } catch (e) {
      console.error('[exercise picker confirm]', e);
      Alert.alert('エラー', '種目を追加できませんでした。');
    } finally {
      isAddingRef.current = false;
    }
  }, [selectedIds, onConfirm]);

  return (
    <ExerciseSelectView
      exercises={exercises}
      sortScope="picker"
      usageStatsExcludeSessionId={excludeSessionId}
      selectedIds={selectedIds}
      onToggle={handleToggle}
      footer={
        <PrimaryButton
          label={selectedIds.length > 0 ? `${selectedIds.length}件を追加` : '追加'}
          onPress={handleConfirm}
          disabled={selectedIds.length === 0}
        />
      }
    />
  );
}
