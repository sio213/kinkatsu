import { ExerciseFilterHeader } from '@/components/exercises/exercise-filter-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { PrimaryButton } from '@/components/ui/primary-button';
import { PickerExerciseRow } from '@/components/workout/picker-exercise-row';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExerciseUsageStats } from '@/hooks/use-exercise-usage-stats';
import { useExercises } from '@/hooks/use-exercises';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
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

// app/workout/exercise-swap.tsx・app/routine/exercise-swap.tsxで共有する「種目を入れ替え」
// 選択画面の本体。検索・カテゴリ絞り込み・並び替え・単一選択・確認ダイアログ・エラーハンドリングは
// 完全に共通で、実際にどこへ(DB/ルーティン下書き)反映するかだけが呼び出し元ごとに異なる
export function ExerciseSwapPicker({
  currentExerciseId,
  currentExerciseName,
  hasRecordedData,
  usageStatsExcludeSessionId,
  confirmMessage,
  onSubmit,
}: Props) {
  const pushDebounced = useDebouncedPush();
  const { exercises } = useExercises();
  const usageStats = useExerciseUsageStats(usageStatsExcludeSessionId);
  const sortBy = useExerciseSortStore((state) => state.swapSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setSwapSortBy);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  // 種目追加ピッカーと違い単一選択（1件だけ）のため、選択idはSetではなく単一の値で持つ
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSubmittingRef = useRef(false);
  const keyboardInset = useKeyboardInset();

  // 種目詳細等へ遷移してこの画面がフォーカスを失うタイミングでキーボードを閉じる（exercise-picker.tsxと同じ対応）
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  // 入れ替え先の候補から自分自身（現在の種目）は除く。選んでも差分が無いため
  const candidates = useMemo(
    () =>
      filterExercises(exercises, activeCategory, search, { sortBy, usageStats }).filter(
        (e) => e.id !== currentExerciseId,
      ),
    [exercises, activeCategory, search, currentExerciseId, sortBy, usageStats],
  );

  const handleToggle = useCallback((id: number) => {
    Keyboard.dismiss();
    setSelectedId(id);
  }, []);

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

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
    // 選択済みidが検索・カテゴリ絞り込みでcandidatesから一時的に外れていても解決できるよう、
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

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <PickerExerciseRow
          exercise={e}
          selected={e.id === selectedId}
          onToggle={handleToggle}
          onPressInfo={handlePressInfo}
          selectionMode="radio"
        />
      </ListErrorBoundary>
    ),
    [selectedId, handleToggle, handlePressInfo],
  );

  const listHeader = (
    <ExerciseFilterHeader
      search={search}
      onChangeSearch={setSearch}
      onSubmitSearch={Keyboard.dismiss}
      activeCategory={activeCategory}
      onChangeCategory={setActiveCategory}
      sortBy={sortBy}
      onChangeSortBy={setSortBy}
    />
  );

  const trimmedSearch = search.trim();
  const emptyComponent = (
    <View style={styles.emptyWrapper}>
      <Text style={styles.empty}>
        {trimmedSearch ? `「${trimmedSearch}」は見つかりません` : '該当する種目がありません'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="種目を入れ替え" subtitle={currentExerciseName} />,
        }}
      />
      <FlatList
        style={styles.list}
        data={candidates}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        // 検索・カテゴリ絞り込み・並び替えをスクロールしても隠れないよう先頭(index 0)で固定する
        stickyHeaderIndices={[0]}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.footer}>
        <PrimaryButton label="入れ替える" onPress={handleSubmit} disabled={selectedId == null} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32 },
  empty: { color: Colors.textMuted, ...Typography.body, textAlign: 'center' },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
