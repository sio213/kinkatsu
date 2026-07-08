import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { ExerciseSearchBar } from '@/components/exercises/exercise-search-bar';
import { ExerciseSortDropdown } from '@/components/exercises/exercise-sort-dropdown';
import { HeaderTitle } from '@/components/ui/header-title';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
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
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { replaceSessionExercise } from '@/lib/workout/session';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExerciseSwapScreen() {
  const {
    sessionId: sessionIdParam,
    sessionExerciseId: sessionExerciseIdParam,
    currentExerciseId: currentExerciseIdParam,
    currentExerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    sessionId: string;
    sessionExerciseId: string;
    currentExerciseId: string;
    currentExerciseName: string;
    hasRecordedData: string;
  }>();
  const sessionId = Number(sessionIdParam);
  const sessionExerciseId = Number(sessionExerciseIdParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { exercises } = useExercises();
  // 今まさに入れ替え対象になっている進行中セッションを実績集計から除外する
  // （exercise-picker.tsxと同じ理由。詳細はhookのコメントを参照）
  const usageStats = useExerciseUsageStats(Number.isFinite(sessionId) ? sessionId : undefined);
  const sortBy = useExerciseSortStore((state) => state.swapSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setSwapSortBy);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  // 種目追加ピッカーと違い単一選択（1件だけ）のため、選択idはSetではなく単一の値で持つ
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSwappingRef = useRef(false);
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

  const runSwap = useCallback(
    async (newExerciseId: number) => {
      if (isSwappingRef.current) return;
      isSwappingRef.current = true;
      try {
        const prefilled = await replaceSessionExercise(sessionExerciseId, newExerciseId);
        if (prefilled) notifyPrefilled([prefilled]);
        router.back();
      } catch (e) {
        console.error('[replace session exercise]', e);
        Alert.alert('エラー', '種目を入れ替えられませんでした。');
      } finally {
        isSwappingRef.current = false;
      }
    },
    [sessionExerciseId, router],
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
      runSwap(selected.id);
      return;
    }
    Alert.alert(`「${selected.name}」に入れ替えますか？`, '入力済みの記録は失われます。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '入れ替える', style: 'destructive', onPress: () => runSwap(selected.id) },
    ]);
  }, [exercises, selectedId, hasRecordedData, runSwap]);

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
    <View style={styles.headerArea}>
      <ExerciseSearchBar value={search} onChangeText={setSearch} onSubmitEditing={Keyboard.dismiss} />
      <CategoryFilterChips activeCategory={activeCategory} onChange={setActiveCategory} />
      <ExerciseSortDropdown sortBy={sortBy} onChange={setSortBy} />
    </View>
  );

  const trimmedSearch = search.trim();
  const emptyComponent = (
    <View style={styles.emptyWrapper}>
      <Text style={styles.empty}>
        {trimmedSearch ? `「${trimmedSearch}」は見つかりません` : '該当する種目がありません'}
      </Text>
    </View>
  );

  if (!Number.isFinite(sessionExerciseId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

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

  headerArea: { paddingTop: 12, gap: 8, marginBottom: 4 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32 },
  empty: { color: Colors.textMuted, ...Typography.body, textAlign: 'center' },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
