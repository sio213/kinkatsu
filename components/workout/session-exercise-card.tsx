import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors } from '@/constants/theme';
import type { SessionExercise } from '@/hooks/use-workout-session';
import { getExerciseImages } from '@/lib/exercises/images';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { exercise: SessionExercise };

// T4でセット入力UIをここに追加する。現状は追加済み種目の一覧表示のみ
export const SessionExerciseCard = memo(function SessionExerciseCard({ exercise }: Props) {
  const images = getExerciseImages(exercise);
  return (
    <View style={styles.card}>
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {exercise.name}
        </Text>
        <CategoryChip category={exercise.category} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
