// lib/workout/history.tsから切り出した、DB(db/client)に依存しない純粋なカテゴリ判定ロジック。
// lib/routines/naming.ts等、DBアクセスを一切伴わないモジュールから安全にimportできるよう
// このファイル単体では@/db/client・drizzle-ormに一切依存しない状態を保つこと
// (lib/workout/set-values.tsと同じ扱い。history.tsは他にDBクエリ関数を多数含むため、
// そちらをimportするとテストにDBモックが必要になってしまう)

import { CATEGORY_ORDER, UNKNOWN_CATEGORY_ORDER } from '@/lib/exercises/constants';

export type PastTrainingSessionExercise = {
  exerciseId: number;
  name: string;
  category: string;
};

// 「過去のトレーニングを選ぶ」画面のカードで、複数カテゴリの日を「胸ほか」のように表す際の
// 代表カテゴリを決める。そのセッションで最も種目数が多いカテゴリを選び、同数の場合はCATEGORY_ORDER
// （胸/背中→肩→腕→脚→お尻→体幹/腹筋→有酸素→その他）で先に来る方を優先し、常に同じ結果になるようにする。
// getPastTrainingSessionsは✓確定セットを持つカードが1件以上あるセッションしか返さないため、
// 呼び出し側はexercisesが空でないことを前提にできるが、念のため空配列はガードする
// （完了サマリーの「ルーティンとして保存」はこれを名前の自動命名にも使う。
// lib/routines/naming.ts参照）
export function pickPrimaryCategory(exercises: { category: string }[]): string | null {
  if (exercises.length === 0) return null;
  const counts = new Map<string, number>();
  for (const e of exercises) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  let best = exercises[0].category;
  for (const [category, count] of counts) {
    const bestCount = counts.get(best)!;
    if (
      count > bestCount ||
      (count === bestCount &&
        (CATEGORY_ORDER[category] ?? UNKNOWN_CATEGORY_ORDER) < (CATEGORY_ORDER[best] ?? UNKNOWN_CATEGORY_ORDER))
    ) {
      best = category;
    }
  }
  return best;
}
