import { AddExerciseButton } from '@/components/workout/add-exercise-button';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  onPress: () => void;
};

// トレーニング中/記録編集画面(app/workout/[id].tsx)発の「種目0件」空状態デザイン
// （中央寄せの控えめなテキスト+AddExerciseButton）。予定の目標セット編集画面
// (app/calendar/schedule-workout-edit.tsx)・ルーティンのテンプレートセット編集画面
// (app/routine/exercise-edit.tsx)・ルーティンフォーム(components/routines/routine-form.tsx)も
// 同じ見た目に統一する（2026-07-22、@ユーザー指摘。一度RoutineAddExerciseButtonの破線ボックス
// (旧variant="empty"、廃止済み)へ寄せる誤った対応をしたため、このコンポーネントに切り出して
// 逆方向に統一し直した。routine-form.tsxは種目一覧が名前・リマインダー等と並ぶフォームの一部で
// 画面全体の中央寄せは成立しないが、`flex:1`はbodyのある親が高さを制約しない限り実質無害に
// 縮退するため、そのまま流用できる。@designer指摘: routine/exercise-edit.tsxと同じ
// draftExercisesを参照するため、揃えないと同一データの行き来で見た目が入れ替わって見えていた）
export function ExerciseEmptyState({ onPress }: Props) {
  return (
    <View style={styles.body}>
      <Text style={styles.emptyText}>まだ種目がありません</Text>
      <AddExerciseButton onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  emptyText: { ...Typography.footnote, color: Colors.textMuted },
});
