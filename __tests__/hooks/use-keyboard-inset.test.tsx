// useKeyboardInset は固定フッターを持たない一覧画面（種目一覧・リマインダー一覧）専用で、
// キーボードの高さ + 余白 32 をスクロールビューの contentInset に渡すためのもの。
// リスナーを解除し損ねると画面を離れた後も setState が走るため、後始末まで見る。
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Keyboard } from 'react-native';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';

type Listener = (event: { endCoordinates: { height: number } }) => void;

function mountWithListeners() {
  const listeners: Record<string, Listener> = {};
  const removes: Record<string, jest.Mock> = {};
  const spy = jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation(((name: string, listener: Listener) => {
      listeners[name] = listener;
      removes[name] = jest.fn();
      return { remove: removes[name] } as never;
    }) as never);

  let captured = 0;
  function Harness() {
    captured = useKeyboardInset();
    return null;
  }
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(Harness));
  });

  return {
    listeners,
    removes,
    get: () => captured,
    unmount: () => act(() => tree.unmount()),
    restore: () => spy.mockRestore(),
  };
}

describe('useKeyboardInset', () => {
  it('初期値は 0', () => {
    const h = mountWithListeners();
    expect(h.get()).toBe(0);
    h.restore();
  });

  it('キーボードが出るとき、高さに余白 32 を足した値を返す', () => {
    const h = mountWithListeners();

    act(() => h.listeners.keyboardWillShow({ endCoordinates: { height: 300 } }));

    expect(h.get()).toBe(332);
    h.restore();
  });

  it('キーボードが閉じると 0 に戻る', () => {
    const h = mountWithListeners();

    act(() => h.listeners.keyboardWillShow({ endCoordinates: { height: 300 } }));
    act(() => h.listeners.keyboardWillHide({ endCoordinates: { height: 0 } }));

    expect(h.get()).toBe(0);
    h.restore();
  });

  it('アンマウントで show/hide 両方のリスナーを解除する', () => {
    const h = mountWithListeners();

    h.unmount();

    expect(h.removes.keyboardWillShow).toHaveBeenCalled();
    expect(h.removes.keyboardWillHide).toHaveBeenCalled();
    h.restore();
  });
});
