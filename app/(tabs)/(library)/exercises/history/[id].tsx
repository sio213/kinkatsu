import { ExerciseHistoryScreen } from '@/components/exercises/exercise-history-screen';

/**
 * 「過去の記録」のタブ配下版（タブバーあり）。種目タブの一覧→種目詳細から開いたときだけここへ来る。
 * 閲覧のドリルダウンなのでタブバーを残す（CLAUDE.md「ナビゲーション・タブバーの表示範囲」）。
 */
export default function ExerciseHistoryInLibraryRoute() {
  return <ExerciseHistoryScreen insideTabBar />;
}
