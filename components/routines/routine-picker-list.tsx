import { RoutinePickerCard } from '@/components/routines/routine-picker-card';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import type { Routine } from '@/db/schema';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

type Props = {
  routines: Routine[];
  summaries: Map<number, { exerciseCount: number; categories: string[] }>;
  onSelect: (routine: Routine) => void;
  onPressBack: () => void;
  // タップの結果は画面によって異なる（時刻選択へ進む/種目を選ぶ画面へ進む/即座にライブ
  // セッションを開始する等）が、同じ画面内であれば行によらず共通のため、一覧全体で1つだけ渡す
  hint?: string;
};

// 「一覧から1件選ぶだけ」の読み取り専用ルーティンピッカー。app/workout/routine-picker.tsx
// （進行中セッションへの追加）・app/calendar/schedule-routine-picker.tsx（未来日の予定追加）・
// app/workout/start-routine-picker.tsx（過去日の事後記録）の3画面が同じ描画（FlatList・
// RoutinePickerCard・空状態）を持つに至ったため共通化した（@reviewer指摘、3本目到達で
// rule of threeの閾値）。画面自体はドメインが異なる（addRoutineExercisesToSession/
// scheduledWorkouts/workoutSessionsとそれぞれ別のDB操作に繋がる）ため分けたまま、
// 描画部分のみをこのコンポーネントに集約する。呼び出し元のparams検証（不正なsessionId/dateKey等）
// はこのコンポーネントの責務外で、各画面が自分のガードとして個別に持つ
export function RoutinePickerList({ routines, summaries, onSelect, onPressBack, hint }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Routine }) => {
      const summary = summaries.get(item.id);
      return (
        <ListErrorBoundary>
          <RoutinePickerCard
            name={item.name}
            exerciseCount={summary?.exerciseCount ?? 0}
            categories={summary?.categories ?? []}
            onPress={() => onSelect(item)}
            hint={hint}
          />
        </ListErrorBoundary>
      );
    },
    [summaries, onSelect, hint],
  );

  if (routines.length === 0) {
    return <NotFoundState message="ルーティンがまだありません" actionLabel="戻る" onPressAction={onPressBack} />;
  }

  return (
    <FlatList
      style={styles.list}
      data={routines}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 16 },
  separator: { height: 11 },
});
