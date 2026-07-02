import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

type ExerciseImages = { source: number; thumbnail?: number };

const IMAGES: Record<string, ExerciseImages> = {
  ダンベルカール: {
    source: require('@/assets/exercise-samples/dumbbell_curl.mp4'),
  },
  ベンチプレス: {
    source: require('@/assets/exercise-samples/bench_press.mp4'),
    thumbnail: require('@/assets/exercise-samples/bench_press_thumb.png'),
  },
};

export function getExerciseImages(
  exercise: Exercise,
): ExerciseImages | undefined {
  if (!isPresetExercise(exercise)) return undefined;
  return IMAGES[exercise.name];
}
