import { chipStyles } from '@/components/exercises/chip-styles';
import { ExerciseCard } from '@/components/exercises/exercise-card';
import { ExerciseForm } from '@/components/exercises/exercise-form';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useExercises } from '@/hooks/use-exercises';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import {
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  EXERCISE_CATEGORIES,
  getCategoryLabel,
} from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CATEGORY_FILTERS = [CATEGORY_ALL, CATEGORY_FAVORITE, ...EXERCISE_CATEGORIES] as const;

export default function ExercisesScreen() {
  const { exercises, addExercise, updateExercise, toggleFavorite, removeExercise } =
    useExercises();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  const [showForm, setShowForm] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [formInitialName, setFormInitialName] = useState('');
  const keyboardInset = useKeyboardInset();

  const filtered = useMemo(
    () => filterExercises(exercises, activeCategory, search),
    [exercises, activeCategory, search],
  );

  const openCreate = useCallback((name = '') => {
    setFormInitialName(name);
    setEditTargetId(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((id: number) => {
    setEditTargetId(id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditTargetId(null);
  }, []);

  // renderItem/ExerciseCard の props 参照を editTargetId の変化で壊さないよう ref 経由で読む
  const editTargetIdRef = useRef(editTargetId);
  editTargetIdRef.current = editTargetId;

  const handleSubmit = useCallback(
    async (values: ExerciseFormValues) => {
      try {
        const targetId = editTargetIdRef.current;
        if (targetId != null) {
          await updateExercise(targetId, values);
        } else {
          await addExercise(values.name, values.category, values.note ?? undefined);
        }
        closeForm();
      } catch (e) {
        console.error('[exercise save]', e);
        Alert.alert('エラー', '種目の保存に失敗しました。');
      }
    },
    [addExercise, updateExercise, closeForm],
  );

  const handleDelete = useCallback(
    (id: number, name: string) => {
      Alert.alert('削除', `「${name}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeExercise(id);
            } catch (e) {
              console.error('[exercise delete]', e);
              Alert.alert('エラー', '削除に失敗しました。');
            }
          },
        },
      ]);
    },
    [removeExercise],
  );

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <ExerciseCard
          exercise={e}
          isEditing={editTargetId === e.id && showForm}
          onEdit={openEdit}
          onCloseEdit={closeForm}
          onDelete={handleDelete}
          onToggleFavorite={toggleFavorite}
          onSubmit={handleSubmit}
        />
      </ListErrorBoundary>
    ),
    [editTargetId, showForm, openEdit, closeForm, handleDelete, toggleFavorite, handleSubmit],
  );

  const listHeader = (
    <View style={styles.headerArea}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>種目ライブラリ</Text>
        {!showForm && (
          <TouchableOpacity style={styles.addBtn} onPress={() => openCreate()}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="種目を検索..."
        clearButtonMode="while-editing"
        returnKeyType="search"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {CATEGORY_FILTERS.map((cat) => {
          const isActive = activeCategory === cat;
          const label = getCategoryLabel(cat);
          return (
            <TouchableOpacity
              key={cat}
              style={[chipStyles.chip, isActive && chipStyles.chipActive]}
              onPress={() => setActiveCategory(cat)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={label}
            >
              <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {showForm && editTargetId == null && (
        <View style={styles.addFormWrapper}>
          <Text style={styles.addFormTitle}>種目を追加</Text>
          <ExerciseForm
            initial={{ name: formInitialName }}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            submitLabel="追加"
          />
        </View>
      )}
    </View>
  );

  const trimmedSearch = search.trim();
  const emptyComponent = !showForm ? (
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
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={listHeader}
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

  headerArea: { paddingTop: 16, gap: 8, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },

  searchInput: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceMuted,
  },

  categoryScroll: { gap: 6 },

  separator: { height: 8 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  empty: { color: Colors.textPlaceholder, fontSize: 14 },
  emptyAddBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyAddBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },

  addFormWrapper: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFormTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
});
