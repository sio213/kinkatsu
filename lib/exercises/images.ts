import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

type ExerciseImages = { source: number; thumbnail?: number };

const IMAGES: Record<string, ExerciseImages> = {
  dumbbell_curl: {
    source: require('@/assets/exercise-samples/dumbbell_curl.mp4'),
  },
  bench_press: {
    source: require('@/assets/exercise-samples/bench_press.mp4'),
    thumbnail: require('@/assets/exercise-samples/bench_press_thumb.png'),
  },
};

export function getExerciseImages(
  exercise: Exercise,
): ExerciseImages | undefined {
  if (!isPresetExercise(exercise) || !exercise.slug) return undefined;
  return IMAGES[exercise.slug];
}
