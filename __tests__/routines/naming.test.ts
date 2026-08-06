import { buildRoutineNameFromExercises } from '@/lib/routines/naming';

function ex(category: string) {
  return { category };
}

// 代表カテゴリの選び方（種目数最多・タイブレーク）はpickPrimaryCategory側の
// __tests__/workout/history.test.tsで網羅済み。ここではラベル変換とフォールバックだけを見る
test('代表カテゴリのラベルから「◯◯の日」を組み立てる', () => {
  expect(buildRoutineNameFromExercises([ex('chest'), ex('chest'), ex('back')])).toBe('胸の日');
  expect(buildRoutineNameFromExercises([ex('shoulder')])).toBe('肩の日');
});

// 「その他の日」はルーティン名として意味を成さない
test('代表カテゴリがotherならフォールバック名を返す', () => {
  expect(buildRoutineNameFromExercises([ex('other'), ex('other')])).toBe('マイルーティン');
});

test('DBに未知のカテゴリ文字列が入っていてもそのまま名前に出さない', () => {
  expect(buildRoutineNameFromExercises([ex('unknown-category')])).toBe('マイルーティン');
});

// 呼び出し側（完了サマリー）はカード0件のとき保存導線自体を出さないが、念のため
test('種目が0件ならフォールバック名を返す', () => {
  expect(buildRoutineNameFromExercises([])).toBe('マイルーティン');
});
