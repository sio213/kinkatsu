import { ExerciseCard } from '@/components/exercises/exercise-card';
import { ExerciseFilterHeader } from '@/components/exercises/exercise-filter-header';
import { HeaderActionButton } from '@/components/ui/header-action-button';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useExerciseUsageStats } from '@/hooks/use-exercise-usage-stats';
import { useExercises } from '@/hooks/use-exercises';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExercisesScreen() {
  const { exercises, toggleFavorite } = useExercises();
  const usageStats = useExerciseUsageStats();
  const sortBy = useExerciseSortStore((state) => state.listSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setListSortBy);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  const keyboardInset = useKeyboardInset();

  // 種目詳細等へ遷移してこの画面がフォーカスを失うタイミングでキーボードを閉じる。
  // 開いたままだと戻ってきたときに一覧が狭いままになってしまうため
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  const filtered = useMemo(
    () => filterExercises(exercises, activeCategory, search, { sortBy, usageStats }),
    [exercises, activeCategory, search, sortBy, usageStats],
  );

  const openCreate = useCallback(
    (name = '') => {
      router.push({ pathname: '/exercise/new', params: { name } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <ExerciseCard exercise={e} onToggleFavorite={toggleFavorite} />
      </ListErrorBoundary>
    ),
    [toggleFavorite],
  );

  const listHeader = (
    <ExerciseFilterHeader
      search={search}
      onChangeSearch={setSearch}
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
        {trimmedSearch
          ? `「${trimmedSearch}」は見つかりません`
          : activeCategory !== CATEGORY_ALL
            ? '該当する種目がありません'
            : '種目がありません'}
      </Text>
      {trimmedSearch ? (
        <TouchableOpacity style={styles.emptyAddBtn} onPress={() => openCreate(trimmedSearch)}>
          <Text style={styles.emptyAddBtnText}>＋ {trimmedSearch}を追加</Text>
        </TouchableOpacity>
      ) : activeCategory === CATEGORY_ALL ? (
        <TouchableOpacity style={styles.emptyAddBtn} onPress={() => openCreate()}>
          <Text style={styles.emptyAddBtnText}>＋ 最初の種目を追加</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActionButton
              icon="plus"
              label="追加"
              onPress={() => openCreate()}
              accessibilityLabel="種目を追加"
            />
          ),
        }}
      />
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={listHeader}
        // 検索・カテゴリ絞り込み・並び替えをスクロールしても隠れないよう先頭(index 0)で固定する
        stickyHeaderIndices={[0]}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },

  separator: { height: 8 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  empty: { color: Colors.textMuted, ...Typography.body, textAlign: 'center' },
  emptyAddBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyAddBtnText: { color: Colors.onAccent, ...Typography.bodyStrong },
});
