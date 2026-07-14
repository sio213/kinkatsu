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
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { buildInitialRoutineSets } from '@/lib/routines/db';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// app/workout/exercise-swap.tsxのルーティン版。DB(workoutSessionExercises)ではなく
// useRoutineDraftStoreの下書き配列を書き換える点だけが異なり、UI・絞り込み・並び替えは共通
export default function RoutineExerciseSwapScreen() {
  const {
    index: indexParam,
    currentExerciseId: currentExerciseIdParam,
    currentExerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    index: string;
    currentExerciseId: string;
    currentExerciseName: string;
    hasRecordedData: string;
  }>();
  const index = Number(indexParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { exercises } = useExercises();
  const replaceExerciseAt = useRoutineDraftStore((state) => state.replaceExerciseAt);
  // ルーティン編集中は「進行中セッション」が無いため、workout側のexcludeSessionIdに相当する除外は不要
  const usageStats = useExerciseUsageStats();
  const sortBy = useExerciseSortStore((state) => state.swapSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setSwapSortBy);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSwappingRef = useRef(false);
  const keyboardInset = useKeyboardInset();

  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

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
    async (selected: Exercise) => {
      if (isSwappingRef.current) return;
      isSwappingRef.current = true;
      try {
        // 種目追加ピッカーで新規追加した直後と同じ状態にする方針(workout側のreplaceSessionExercise
        // と同じ考え方)。前回の実績があればプリフィルし、無ければ空欄の1セットにフォールバックする
        const newSets = await buildInitialRoutineSets(selected.id);
        replaceExerciseAt(index, {
          exerciseId: selected.id,
          name: selected.name,
          category: selected.category,
          measurementType: selected.measurementType,
          source: selected.source,
          slug: selected.slug,
          sets: newSets,
        });
        router.back();
      } catch (e) {
        console.error('[replace routine draft exercise]', e);
        Alert.alert('エラー', '種目を入れ替えられませんでした。');
      } finally {
        isSwappingRef.current = false;
      }
    },
    [index, replaceExerciseAt, router],
  );

  const handleSubmit = useCallback(() => {
    const selected = exercises.find((e) => e.id === selectedId);
    if (!selected) return;
    // 既存のセットに値が1つも入っていなければ失われるものが無く、確認なしで入れ替えてよい
    // （トレーニング中画面のセット削除確認要否と同じ考え方）
    if (!hasRecordedData) {
      runSwap(selected);
      return;
    }
    Alert.alert(`「${selected.name}」に入れ替えますか？`, '設定済みのセット内容は失われます。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '入れ替える', style: 'destructive', onPress: () => runSwap(selected) },
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

  if (!Number.isFinite(index)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="種目が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
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
