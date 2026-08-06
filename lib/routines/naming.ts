import { CATEGORY_LABELS, type ExerciseCategory } from '@/lib/exercises/constants';
import { pickPrimaryCategory } from '@/lib/workout/session-category';

// 代表カテゴリが決まらない／「その他」だった場合の名前。「その他の日」は
// ルーティン名として意味を成さないため、カテゴリ由来の命名自体を諦める
const FALLBACK_ROUTINE_NAME = 'マイルーティン';

/**
 * 完了サマリー「ルーティンとして保存」で、ルーティン新規作成フォームに入れる名前の初期値。
 *
 * 空のまま着地させない。ルーティン名は必須（このディレクトリのvalidation.tsのroutineFormSchema）で、
 * 空だと「保存する」を押した直後にバリデーションエラーになり、「1タップで保存できます」と
 * 誘っておいて最初にキーボード入力を強いることになるため。
 *
 * 日付は入れない（「胸の日（8/6）」だと毎回使うテンプレートの名前として保存日が残り続ける）。
 * 代表カテゴリの決め方は「過去のトレーニングを選ぶ」画面のカードと共通（pickPrimaryCategory）で、
 * セット数ではなく種目数が最多のカテゴリ・同数ならCATEGORY_ORDER順で安定する。
 */
export function buildRoutineNameFromExercises(exercises: { category: string }[]): string {
  const category = pickPrimaryCategory(exercises);
  if (category == null || category === 'other') return FALLBACK_ROUTINE_NAME;
  // DBに想定外のカテゴリ文字列が入っていた場合もフォールバックする（getCategoryLabelは
  // 未知の値をそのまま返すため、ここで通すと「chestの日」のような名前になりうる）
  const label = CATEGORY_LABELS[category as ExerciseCategory];
  if (!label) return FALLBACK_ROUTINE_NAME;
  return `${label}の日`;
}
