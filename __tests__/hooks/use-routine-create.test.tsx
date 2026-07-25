const mockPushDebounced = jest.fn();
const mockReset = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPushDebounced,
}));
jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: { reset: () => void }) => unknown) => selector({ reset: mockReset }),
}));

import { useRoutineCreate } from '@/hooks/use-routine-create';
import React from 'react';
import { act, create } from 'react-test-renderer';

// ルーティン選択画面のヘッダー＋と、0件時の空状態の主CTAが共有する遷移フック。
// @testing-library/react-hooksは入っていないため、フックを呼ぶだけの小さなコンポーネントに包んで
// react-test-rendererで実行する
function callHook() {
  let handle!: () => void;
  function Probe() {
    handle = useRoutineCreate();
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  act(() => {
    handle();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('/routine/newへ遷移する', () => {
  callHook();
  expect(mockPushDebounced).toHaveBeenCalledWith('/routine/new');
});

// 順序が入れ替わると、新規作成フォームの初回描画（defaultValuesの読み込み）が
// 作成画面側のuseEffectより先に走ったときに前回の下書きが一瞬見えてしまう。
// 結果だけを見る画面テストではこの回帰を検出できないため、ここで順序契約を固定する（@tester指摘）
test('resetDraftをpushより先に呼ぶ（前回の下書きが一瞬見えるのを防ぐ順序契約）', () => {
  callHook();
  expect(mockReset).toHaveBeenCalled();
  expect(mockReset.mock.invocationCallOrder[0]).toBeLessThan(mockPushDebounced.mock.invocationCallOrder[0]);
});
