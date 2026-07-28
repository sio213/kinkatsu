import { ExerciseHistoryScreen } from '@/components/exercises/exercise-history-screen';

/**
 * 「過去の記録」のルートStack版（タブバーなし）。種目タブの一覧以外の導線から開いた種目詳細
 * （トレーニング中・ルーティン編集・予定編集など）から来る。
 */
export default function ExerciseHistoryRoute() {
  return <ExerciseHistoryScreen />;
}
