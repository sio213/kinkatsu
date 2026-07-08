import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { ExerciseSearchBar } from '@/components/exercises/exercise-search-bar';
import { ExerciseSortDropdown } from '@/components/exercises/exercise-sort-dropdown';
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
import { addExercisesToSession } from '@/lib/workout/session';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExercisePickerScreen() {
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { exercises } = useExercises();
  // 今まさに種目を追加している進行中セッションを実績集計から除外する（自分自身を
  // 「過去の実績」として参照しないようにするため。詳細はhookのコメントを参照）
  const usageStats = useExerciseUsageStats(Number.isFinite(sessionId) ? sessionId : undefined);
  const sortBy = useExerciseSortStore((state) => state.pickerSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setPickerSortBy);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  // 選択順を保持するため配列で管理する（Setだと挿入順の保証が実装依存になるため避ける）
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const isAddingRef = useRef(false);
  const keyboardInset = useKeyboardInset();

  // 種目詳細等へ遷移してこの画面がフォーカスを失うタイミングでキーボードを閉じる。
  // 開いたままだと戻ってきたときに一覧が狭いままになってしまうため（exercises.tsxと同じ対応）
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  // 同じ種目をセッション内に複数回追加できるため（ウォームアップ→本セットを別カードで記録する等）、
  // 既に追加済みの種目でも候補から除外しない
  const filtered = useMemo(
    () => filterExercises(exercises, activeCategory, search, { sortBy, usageStats }),
    [exercises, activeCategory, search, sortBy, usageStats],
  );

  const handleToggle = useCallback((id: number) => {
    // 選択したら検索キーボードを閉じ、画面下部の「追加」ボタンを隠れさせない
    Keyboard.dismiss();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existingId) => existingId !== id) : [...prev, id],
    );
  }, []);

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleAdd = useCallback(async () => {
    if (selectedIds.length === 0 || !Number.isFinite(sessionId)) return;
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    try {
      const prefilled = await addExercisesToSession(sessionId, selectedIds);
      notifyPrefilled(prefilled);
      router.back();
    } catch (e) {
      console.error('[add exercises to session]', e);
      Alert.alert('エラー', '種目を追加できませんでした。');
    } finally {
      isAddingRef.current = false;
    }
  }, [selectedIds, sessionId, router]);

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <PickerExerciseRow
          exercise={e}
          selected={selectedIds.includes(e.id)}
          onToggle={handleToggle}
          onPressInfo={handlePressInfo}
        />
      </ListErrorBoundary>
    ),
    [selectedIds, handleToggle, handlePressInfo],
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

  if (!Number.isFinite(sessionId)) {
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
      <FlatList
        style={styles.list}
        data={filtered}
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
        <PrimaryButton
          label={selectedIds.length > 0 ? `${selectedIds.length}件を追加` : '追加'}
          onPress={handleAdd}
          disabled={selectedIds.length === 0}
        />
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
  empty: { color: Colors.textPlaceholder, ...Typography.body, textAlign: 'center' },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
