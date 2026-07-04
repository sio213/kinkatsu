import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getExerciseImages } from '@/lib/exercises/images';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { useFavoriteToggle } from '@/hooks/use-favorite-toggle';

type Props = {
  exercise: Exercise;
  onToggleFavorite: (id: number, favorite: boolean) => Promise<void>;
};

export const ExerciseCard = memo(function ExerciseCard({
  exercise: e,
  onToggleFavorite,
}: Props) {
  const router = useRouter();
  const { localFav, toggle: handleFavoritePress } = useFavoriteToggle(e.id, e.favorite, onToggleFavorite);

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
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChip: {
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 11.5, color: Colors.accent, fontWeight: '600' },

  star: { fontSize: 20, color: Colors.borderStrong },
  starActive: { color: Colors.favorite },

  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
