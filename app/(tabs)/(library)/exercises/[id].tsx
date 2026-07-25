import { ExerciseDetailScreen } from '@/components/exercises/exercise-detail-screen';

/**
 * 種目詳細のタブ配下版（タブバーあり）。種目タブの一覧から開いたときだけここへ来る。
 * 詳細は components/exercises/exercise-detail-screen.tsx のJSDocを参照。
 */
export default function ExerciseDetailInLibraryRoute() {
  return <ExerciseDetailScreen insideTabBar />;
}
