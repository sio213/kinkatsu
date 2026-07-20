// lib/workout/history.tsから切り出した、DB(db/client)に依存しない純粋な値判定ロジック。
// lib/routines/validation.ts等、DBアクセスを一切伴わないモジュールから安全にimportできるよう
// このファイル単体では@/db/client・drizzle-ormに一切依存しない状態を保つこと
// (history.tsは他にDBクエリ関数を多数含むため、そちらをimportするとテストにDBモックが
// 必要になってしまう)

export type PreviousSetValues = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// 4つの値カラムのいずれかに実際の値が入っているか。前回セットが✓未確定のまま
// 何も入力せずに終えたセッションの場合、getPreviousSets/getPreviousSetsForCardは
// 全カラムnullの行を返しうる（「セット追加」だけ押されて未入力のまま終わった等）。
// そのような行は「前回入力した値」として意味を持たないため、コピー元から除外する
// （除外しないと新しいカードに余分な空行が増えたり、値の無い行が背景色だけゴースト表示される
// ＝中身が空なのに「前回の値がある」ように見える、という2つの問題が起きる）。
// 引数はPreviousSetValuesのsetNumberを持たない形（scheduledWorkoutExercises等、setNumber
// フィールドが無いオブジェクト）でも呼べるよう4カラムのPickだけを要求する（@reviewer指摘、2026-07-20）
export function hasAnyValue(s: Pick<PreviousSetValues, 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters'>): boolean {
  return s.weight != null || s.reps != null || s.durationSeconds != null || s.distanceMeters != null;
}
