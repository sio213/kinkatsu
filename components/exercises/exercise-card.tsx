import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getExerciseImages } from '@/lib/exercises/images';
import { useFavoriteToggle } from '@/hooks/use-favorite-toggle';
import { useDebouncedPush } from '@/hooks/use-debounced-push';

type Props = {
  exercise: Exercise;
  onToggleFavorite: (id: number, favorite: boolean) => Promise<void>;
};

export const ExerciseCard = memo(function ExerciseCard({
  exercise: e,
  onToggleFavorite,
}: Props) {
  const push = useDebouncedPush();
  const { localFav, toggle: handleFavoritePress } = useFavoriteToggle(e.id, e.favorite, onToggleFavorite);

  const images = getExerciseImages(e);

  const handlePress = useCallback(() => {
    push(`/exercise/${e.id}`);
  }, [push, e.id]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      accessibilityLabel={`${e.name}の詳細を見る`}
    >
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
        <View style={styles.meta}>
          <CategoryChip category={e.category} />
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
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  star: { fontSize: 20, color: Colors.borderStrong },
  starActive: { color: Colors.favorite },

  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
