import { ExerciseCard } from '@/components/exercises/exercise-card';
import { ExerciseForm, type ExerciseFormValues } from '@/components/exercises/exercise-form';
import type { Exercise } from '@/db/schema';
import { useExercises } from '@/hooks/use-exercises';
import {
  CATEGORY_ALL,
  CATEGORY_FAVORITE,
  EXERCISE_CATEGORIES,
} from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
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
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardInset(e.endCoordinates.height + 32);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

  const handleSubmit = useCallback(
    async (values: ExerciseFormValues) => {
      try {
        if (editTargetId != null) {
          await updateExercise(editTargetId, values);
        } else {
          await addExercise(values.name, values.category, values.note ?? undefined);
        }
        closeForm();
      } catch (e) {
        console.error('[exercise save]', e);
        Alert.alert('エラー', '種目の保存に失敗しました。');
      }
    },
    [editTargetId, addExercise, updateExercise, closeForm],
  );

  const handleDelete = useCallback(
    (id: number, name: string) => {
      Alert.alert('削除', `「${name}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => removeExercise(id) },
      ]);
    },
    [removeExercise],
  );

  const handleToggleFavorite = useCallback(
    async (id: number, favorite: boolean) => {
      try {
        await toggleFavorite(id, favorite);
      } catch (err) {
        console.error('[toggle favorite]', err);
        Alert.alert('エラー', 'お気に入りの更新に失敗しました。');
      }
    },
    [toggleFavorite],
  );

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ExerciseCard
        exercise={e}
        isEditing={editTargetId === e.id && showForm}
        onEdit={() => openEdit(e.id)}
        onCloseEdit={closeForm}
        onDelete={() => handleDelete(e.id, e.name)}
        onToggleFavorite={(fav) => handleToggleFavorite(e.id, fav)}
        onSubmit={handleSubmit}
      />
    ),
    [editTargetId, showForm, openEdit, closeForm, handleDelete, handleToggleFavorite, handleSubmit],
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
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{cat}</Text>
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
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        style={styles.list}
        data={filtered}
        extraData={filtered}
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
  safeArea: { flex: 1, backgroundColor: '#fff' },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },

  headerArea: { paddingTop: 16, gap: 8, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  addBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  searchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },

  categoryScroll: { gap: 6 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  separator: { height: 8 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  empty: { color: '#94A3B8', fontSize: 14 },
  emptyAddBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyAddBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  addFormWrapper: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addFormTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
});
