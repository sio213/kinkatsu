import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

type ExerciseImages = { source?: number; thumbnail: number };

const IMAGES: Record<string, { source: number; thumbnail?: number }> = {
  dumbbell_curl: {
    source: require('@/assets/exercise-samples/dumbbell_curl.mp4'),
  },
  bench_press: {
    source: require('@/assets/exercise-samples/bench_press.mp4'),
    thumbnail: require('@/assets/exercise-samples/bench_press_thumb.png'),
  },
};

// 種目ごとのサムネイル素材がまだ揃っていないため、未用意の種目はこの画像を仮のサムネイルとして使う
const PLACEHOLDER_THUMBNAIL = require('@/assets/exercise-samples/bench_press_thumb.png');

export function getExerciseImages(exercise: Exercise): ExerciseImages {
  const entry = isPresetExercise(exercise) && exercise.slug ? IMAGES[exercise.slug] : undefined;
  return {
    source: entry?.source,
    thumbnail: entry?.thumbnail ?? PLACEHOLDER_THUMBNAIL,
  };
}
