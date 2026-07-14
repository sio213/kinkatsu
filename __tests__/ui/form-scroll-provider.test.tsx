import { FormScrollProvider, useFormScrollRegistration, useScrollToFirstError } from '@/components/ui/form-scroll-context';
import React, { useRef } from 'react';
import { act, create } from 'react-test-renderer';
import { Keyboard, type View } from 'react-native';

// FormFieldは実ネイティブのView refを使うが、DropdownMenuのmeasureInWindowと同じ理由で
// jest-expo環境では実際のmeasureLayoutは呼ばれない(react-test-rendererのcreateNodeMockは
// ネイティブブリッジ経由の非同期APIを差し替えられない)。ここではFormScrollProvider自身の
// 「登録された複数フィールドの中から一番上の項目までスクロールする」というオーケストレーション
// ロジックを検証したいので、useFormScrollRegistrationに渡すref自体を完全に自作のPOJOにして
// measureLayoutの結果を直接制御する
function makeFieldRef(y: number | null): React.RefObject<View> {
  return {
    current: {
      measureLayout: (
        _container: unknown,
        onSuccess: (x: number, y: number) => void,
        onFail?: () => void,
      ) => {
        if (y == null) onFail?.();
        else onSuccess(0, y);
      },
    } as unknown as View,
  };
}

function TestField({ name, y }: { name: string; y: number | null }) {
  const ref = useRef(makeFieldRef(y).current);
  useFormScrollRegistration(name, ref);
  return null;
}

function TestConsumer({ onReady }: { onReady: (fn: (errors: Record<string, unknown>) => void) => void }) {
  const scrollToFirstError = useScrollToFirstError();
  onReady(scrollToFirstError);
  return null;
}

function flushRequestAnimationFrameAndPromises() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('複数のエラー項目のうち、実測Y座標が一番小さい(画面上で一番上の)項目までスクロールする', async () => {
  const scrollTo = jest.fn();
  const scrollRef = { current: { getInnerViewNode: () => 1, scrollTo } } as any;
  let trigger: ((errors: Record<string, unknown>) => void) | null = null;

  act(() => {
    create(
      <FormScrollProvider scrollRef={scrollRef}>
        <TestField name="name" y={300} />
        <TestField name="category" y={50} />
        <TestConsumer onReady={(fn) => (trigger = fn)} />
      </FormScrollProvider>,
    );
  });

  await act(async () => {
    trigger?.({ name: {}, category: {} });
    await flushRequestAnimationFrameAndPromises();
  });

  expect(Keyboard.dismiss).toHaveBeenCalled();
  expect(scrollTo).toHaveBeenCalledWith({ y: 50 - 16, animated: true });
});

test('登録されていないフィールド名(非表示等で測定できない)は無視して測定できた項目だけで判定する', async () => {
  const scrollTo = jest.fn();
  const scrollRef = { current: { getInnerViewNode: () => 1, scrollTo } } as any;
  let trigger: ((errors: Record<string, unknown>) => void) | null = null;

  act(() => {
    create(
      <FormScrollProvider scrollRef={scrollRef}>
        <TestField name="weekdays" y={200} />
        <TestConsumer onReady={(fn) => (trigger = fn)} />
      </FormScrollProvider>,
    );
  });

  await act(async () => {
    // 'monthdays'は登録されていない(現在非表示のフィールド)想定
    trigger?.({ weekdays: {}, monthdays: {} });
    await flushRequestAnimationFrameAndPromises();
  });

  expect(scrollTo).toHaveBeenCalledWith({ y: 200 - 16, animated: true });
});

test('どの項目も測定できなかった場合はscrollToを呼ばない', async () => {
  const scrollTo = jest.fn();
  const scrollRef = { current: { getInnerViewNode: () => 1, scrollTo } } as any;
  let trigger: ((errors: Record<string, unknown>) => void) | null = null;

  act(() => {
    create(
      <FormScrollProvider scrollRef={scrollRef}>
        <TestConsumer onReady={(fn) => (trigger = fn)} />
      </FormScrollProvider>,
    );
  });

  await act(async () => {
    trigger?.({ name: {} });
    await flushRequestAnimationFrameAndPromises();
  });

  expect(scrollTo).not.toHaveBeenCalled();
});

test('ScrollViewの参照がまだ無い(未マウント等)場合は何もしない', async () => {
  const scrollRef = { current: null } as any;
  let trigger: ((errors: Record<string, unknown>) => void) | null = null;

  act(() => {
    create(
      <FormScrollProvider scrollRef={scrollRef}>
        <TestField name="name" y={100} />
        <TestConsumer onReady={(fn) => (trigger = fn)} />
      </FormScrollProvider>,
    );
  });

  await act(async () => {
    expect(() => trigger?.({ name: {} })).not.toThrow();
    await flushRequestAnimationFrameAndPromises();
  });
});

test('Provider外(useContextがnull)でuseScrollToFirstErrorを呼んでもクラッシュしない(no-op)', () => {
  let trigger: ((errors: Record<string, unknown>) => void) | null = null;
  act(() => {
    create(<TestConsumer onReady={(fn) => (trigger = fn)} />);
  });

  expect(() => trigger?.({ name: {} })).not.toThrow();
});
