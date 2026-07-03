import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getExerciseImages } from '@/lib/exercises/images';
import { getCategoryLabel } from '@/lib/exercises/constants';
import type { ExerciseFormValues } from '@/lib/exercises/validation';
import { ExerciseForm } from './exercise-form';

type Props = {
  exercise: Exercise;
  isEditing: boolean;
  onEdit: (id: number) => void;
  onCloseEdit: () => void;
  onDelete: (id: number, name: string) => void;
  onToggleFavorite: (id: number, favorite: boolean) => Promise<void>;
  onSubmit: (values: ExerciseFormValues) => void;
};

export const ExerciseCard = memo(function ExerciseCard({
  exercise: e,
  isEditing,
  onEdit,
  onCloseEdit,
  onDelete,
  onToggleFavorite,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [localFav, setLocalFav] = useState(!!e.favorite);

  useEffect(() => {
    setLocalFav(!!e.favorite);
  }, [e.favorite]);

  async function handleFavoritePress() {
    const next = !localFav;
    setLocalFav(next);
    try {
      await onToggleFavorite(e.id, next);
    } catch (err) {
      console.error('[toggle favorite]', err);
      setLocalFav(!next);
      Alert.alert('エラー', 'お気に入りの更新に失敗しました。');
    }
  }

  const images = getExerciseImages(e);

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.cardMain}>
          {images?.thumbnail != null && (
            <TouchableOpacity onPress={() => router.push(`/exercise/${e.id}`)}>
              <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
            </TouchableOpacity>
          )}
          <View style={styles.info}>
            <TouchableOpacity onPress={() => router.push(`/exercise/${e.id}`)}>
              <Text style={styles.name}>{e.name}</Text>
            </TouchableOpacity>
            <View style={styles.meta}>
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>{getCategoryLabel(e.category)}</Text>
              </View>
              {e.note ? (
                <Text style={styles.note} numberOfLines={1}>
                  {e.note}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleFavoritePress}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={localFav ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            <Text style={[styles.star, localFav && styles.starActive]}>
              {localFav ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={isEditing ? onCloseEdit : () => onEdit(e.id)}
            accessibilityLabel={isEditing ? '編集を閉じる' : `${e.name}を編集`}
          >
            <Text style={styles.actionBtnText}>{isEditing ? '閉じる' : '編集'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => onDelete(e.id, e.name)}
            accessibilityLabel={`${e.name}を削除`}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isEditing && (
        <View style={styles.editWrapper}>
          <Text style={styles.editTitle}>種目を編集</Text>
          <ExerciseForm
            initial={{ name: e.name, category: e.category, note: e.note }}
            onSubmit={onSubmit}
            onCancel={onCloseEdit}
            submitLabel="保存"
            autoFocus={false}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumbnail: { width: 60, height: 60, borderRadius: 6 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.light.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChip: {
    backgroundColor: Colors.light.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: { fontSize: 12, color: Colors.light.accent, fontWeight: '600' },
  note: { fontSize: 12, color: Colors.light.textPlaceholder, flex: 1 },

  star: { fontSize: 20, color: Colors.light.borderStrong },
  starActive: { color: Colors.light.favorite },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.light.border,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, color: Colors.light.textBody, fontWeight: '500' },
  actionBtnDanger: { backgroundColor: Colors.light.dangerSurface },
  actionBtnDangerText: { color: Colors.light.danger },

  editWrapper: {
    backgroundColor: Colors.light.surfaceSubtle,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginTop: 4,
  },
  editTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.textPrimary, marginBottom: 8 },
});
