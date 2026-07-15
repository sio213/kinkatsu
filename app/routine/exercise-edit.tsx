import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { RoutineTemplateExerciseCard } from '@/components/routines/routine-template-exercise-card';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useExercisesWithHistory } from '@/hooks/use-workout-session';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { NO_SESSION_TO_EXCLUDE } from '@/lib/workout/history';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ルーティンの下書き（useRoutineDraftStore）にある全種目をまとめて編集する画面。
// 種目の追加・並び順はルーティンフォーム側で行い、この画面はセットの追加・削除・値編集と
// 種目単体の削除・並び替え・入れ替え・過去記録の読み込み（⋮メニュー）に専念する。保存操作の実体は
// 無く、ヘッダーの戻るアイコンで抜けても結果は同じであることが分かるよう、フッターのボタンも
// 「保存」ではなく実態通り「戻る」とする
export default function RoutineExerciseEditScreen() {
  const router = useRouter();
  const { focusIndex: focusIndexParam } = useLocalSearchParams<{ focusIndex?: string }>();
  const focusIndex = focusIndexParam != null ? Number(focusIndexParam) : null;
  const exercises = useRoutineDraftStore((state) => state.exercises);
  const keyboardInset = useKeyboardInset();
  const historyExerciseIds = useExercisesWithHistory(NO_SESSION_TO_EXCLUDE);

  // ルーティンフォームの種目一覧でタップした種目のカードまで自動スクロールするための位置計測。
  // 各カードの実際のレイアウトはonLayoutでしか分からないため、行(list)自体とタップされた
  // 種目カードの両方のY座標が判明した時点で一度だけscrollToする
  const scrollRef = useRef<ScrollView>(null);
  // list・item(親子)のonLayoutは発火順序が保証されないため、初期値をnullにして
  // 「まだ測定されていない」ことと「実際にy=0」を区別できるようにする
  const listOffsetRef = useRef<number | null>(null);
  const itemOffsetsRef = useRef<Record<number, number>>({});
  const scrolledToFocusRef = useRef(false);

  const tryScrollToFocus = useCallback(() => {
    if (scrolledToFocusRef.current || focusIndex == null) return;
    const listY = listOffsetRef.current;
    const itemY = itemOffsetsRef.current[focusIndex];
    if (listY == null || itemY == null) return;
    scrolledToFocusRef.current = true;
    // 画面遷移のスライドが終わる前に確定させ、遷移完了時には既にその位置にいるように見せる
    // (遷移後に改めてスクロールするとジャンプが二重に見えてしまう)。
    // 対象カードの上端をそのまま画面上端に合わせるとcontentのpaddingTop分だけ他の画面より
    // 詰まって見えるため、通常スクロール時と同じ見た目のリズムになるよう差し引く
    const y = Math.max(0, listY + itemY - styles.content.paddingTop);
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [focusIndex]);

  const handleListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      listOffsetRef.current = e.nativeEvent.layout.y;
      tryScrollToFocus();
    },
    [tryScrollToFocus],
  );

  const handleItemLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      itemOffsetsRef.current[index] = e.nativeEvent.layout.y;
      tryScrollToFocus();
    },
    [tryScrollToFocus],
  );

  const handleAddExercise = useCallback(() => {
    // この画面自身から開いた場合は、確定後にこのままこの画面へ戻ればよい(ドラフトストアは
    // 共有なので新しい種目は自動で反映される)。ルーティンフォーム画面から開いた場合(この画面を
    // 経由しない)と区別するため、returnToパラメータで「既にこの画面を経由している」ことを伝える
    router.push({ pathname: '/routine/exercise-picker', params: { returnTo: 'exercise-edit' } });
  }, [router]);

  const handleReorder = useCallback(() => {
    router.push('/routine/exercise-reorder');
  }, [router]);

  const menuItems: DropdownMenuItem[] = [
    {
      key: 'reorder',
      label: '種目を並び替え',
      icon: 'swap-vert',
      disabled: exercises.length <= 1,
      hint: exercises.length <= 1 ? '2種目以上あるときに使えます' : undefined,
      onPress: handleReorder,
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => <HeaderMenu groups={[menuItems]} accessibilityLabel="種目編集のメニューを開く" />,
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        {exercises.length === 0 ? (
          <RoutineAddExerciseButton variant="empty" onPress={handleAddExercise} />
        ) : (
          <View testID="exercise-list" style={styles.list} onLayout={handleListLayout}>
            {exercises.map((exercise, index) => (
              <View key={`${exercise.exerciseId}-${index}`} testID={`exercise-item-${index}`} onLayout={handleItemLayout(index)}>
                <RoutineTemplateExerciseCard
                  exercise={exercise}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === exercises.length - 1}
                  hasHistory={historyExerciseIds.has(exercise.exerciseId)}
                />
              </View>
            ))}
            <RoutineAddExerciseButton variant="ghost" onPress={handleAddExercise} />
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="戻る" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  list: { gap: 10 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
