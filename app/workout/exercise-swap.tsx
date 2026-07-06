import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { ExerciseSearchBar } from '@/components/exercises/exercise-search-bar';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SwapExerciseRow } from '@/components/workout/swap-exercise-row';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExercises } from '@/hooks/use-exercises';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { swapSessionExercise } from '@/lib/workout/session';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExerciseSwapScreen() {
  const {
    sessionExerciseId: sessionExerciseIdParam,
    currentExerciseId: currentExerciseIdParam,
    currentMeasurementType,
  } = useLocalSearchParams<{
    sessionExerciseId: string;
    currentExerciseId: string;
    currentMeasurementType: string;
  }>();
  const sessionExerciseId = Number(sessionExerciseIdParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { exercises } = useExercises();

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
    () => filterExercises(exercises, activeCategory, search).filter((e) => e.id !== currentExerciseId),
    [exercises, activeCategory, search, currentExerciseId],
  );

  const handleSelect = useCallback((id: number) => {
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
        await swapSessionExercise(sessionExerciseId, newExerciseId);
        router.back();
      } catch (e) {
        console.error('[swap session exercise]', e);
        Alert.alert('エラー', '種目を入れ替えられませんでした。');
      } finally {
        isSwappingRef.current = false;
      }
    },
    [sessionExerciseId, router],
  );

  const handleSubmit = useCallback(() => {
    const selected = candidates.find((e) => e.id === selectedId);
    if (!selected) return;
    // 計測タイプが同じなら入力済みの値をそのまま引き継げるため確認なしで即入れ替える。
    // 異なる場合は値がクリアされる（swapSessionExercise側の挙動）ため、事前に確認する
    if (selected.measurementType === currentMeasurementType) {
      runSwap(selected.id);
      return;
    }
    Alert.alert('この種目に入れ替えますか？', '入力済みの記録は失われます。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '入れ替える', style: 'destructive', onPress: () => runSwap(selected.id) },
    ]);
  }, [candidates, selectedId, currentMeasurementType, runSwap]);

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <SwapExerciseRow exercise={e} selected={e.id === selectedId} onSelect={handleSelect} onPressInfo={handlePressInfo} />
      </ListErrorBoundary>
    ),
    [selectedId, handleSelect, handlePressInfo],
  );

  const listHeader = (
    <View style={styles.headerArea}>
      <ExerciseSearchBar value={search} onChangeText={setSearch} onSubmitEditing={Keyboard.dismiss} />
      <CategoryFilterChips activeCategory={activeCategory} onChange={setActiveCategory} />
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
  empty: { color: Colors.textPlaceholder, fontSize: 14 },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
