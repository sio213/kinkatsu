import { shouldShowRoutineSavePrompt } from '@/lib/workout/routine-save-prompt';

function input(overrides: Partial<Parameters<typeof shouldShowRoutineSavePrompt>[0]> = {}) {
  return {
    canSaveAsRoutine: true,
    hasRoutines: false,
    routinesLoaded: true,
    dismissed: false,
    dismissLoaded: true,
    ...overrides,
  };
}

test('ルーティン0件・未dismissで、⋮に保存項目が出る状態なら出す', () => {
  expect(shouldShowRoutineSavePrompt(input())).toBe(true);
});

// ⋮に項目が出ない状態（ルーティン開始のセッション・種目0件・取得失敗）は
// canSaveAsRoutineが偽になる。ここで条件を再計算しないことで、
// 「本文カードは出るのに⋮には項目が無い」不整合を構造的に防ぐ
test('⋮に保存項目が出ない状態なら出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ canSaveAsRoutine: false }))).toBe(false);
});

// 本文カードは画面の主役（達成感）を押しのけて割り込むため、既に仕組みを知っている人には出さない
test('ルーティンを1件でも持っていれば出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ hasRoutines: true }))).toBe(false);
});

test('「今後表示しない」を押した後は出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ dismissed: true }))).toBe(false);
});

// 解決前に「0件だから出す」と判定すると、ルーティンを持っている人の画面にも一瞬差し込まれる
test('ルーティンの有無が未解決のうちは出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ routinesLoaded: false }))).toBe(false);
});

// AsyncStorageの復元は非同期。待たないと、閉じたはずのユーザーに数フレーム差し込まれる
test('dismissedの復元が終わるまでは出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ dismissLoaded: false }))).toBe(false);
});

test('dismiss済みかつルーティン保有でも出さない', () => {
  expect(shouldShowRoutineSavePrompt(input({ dismissed: true, hasRoutines: true }))).toBe(false);
});
