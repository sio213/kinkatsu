import { ExerciseDetailScreen } from '@/components/exercises/exercise-detail-screen';

/**
 * 種目詳細のルートStack版（タブバーなし）。種目タブの一覧以外のすべての導線がここへ来る。
 * 詳細は components/exercises/exercise-detail-screen.tsx のJSDocを参照。
 */
export default function ExerciseDetailRoute() {
  return <ExerciseDetailScreen />;
}
