import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getExerciseImages } from '@/lib/exercises/images';
import { getCategoryLabel } from '@/lib/exercises/constants';

type Props = {
  exercise: Exercise;
  onToggleFavorite: (id: number, favorite: boolean) => Promise<void>;
};

export const ExerciseCard = memo(function ExerciseCard({
  exercise: e,
  onToggleFavorite,
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
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/exercise/${e.id}`)}
      accessibilityLabel={`${e.name}の詳細を見る`}
    >
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name}>{e.name}</Text>
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
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbnail: { width: 60, height: 60, borderRadius: 6 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChip: {
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  note: { fontSize: 12, color: Colors.textPlaceholder, flex: 1 },

  star: { fontSize: 20, color: Colors.borderStrong },
  starActive: { color: Colors.favorite },

  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
