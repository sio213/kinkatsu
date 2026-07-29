import {
  computeFocusedInputScrollTarget,
  FocusedInputScrollProvider,
  useScrollFocusedInputIntoView,
} from '@/components/ui/focused-input-scroll-context';
import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

// フォーカスした入力欄の下に残す余白（focused-input-scroll-context.tsxのBOTTOM_MARGIN）
const BOTTOM_MARGIN = 24;

describe('computeFocusedInputScrollTarget', () => {
  test('入力欄が表示領域に収まっているならスクロールしない（タップしただけで画面が動かない）', () => {
    expect(
      computeFocusedInputScrollTarget({ viewportY: 100, inputHeight: 40, contentY: 300, viewportHeight: 500 }),
    ).toBeNull();
  });

  test('入力欄自体は表示領域に入っていても、下の余白ぶんが足りなければスクロールする（縁に貼り付かせない）', () => {
    // 入力欄の下端は 445 + 40 = 485 で表示領域(500)の内側だが、余白まで含めると9はみ出す
    expect(
      computeFocusedInputScrollTarget({ viewportY: 445, inputHeight: 40, contentY: 800, viewportHeight: 500 }),
    ).toBe(800 - 445 + 9);
    expect(BOTTOM_MARGIN).toBe(24);
  });

  test('キーボードで表示領域が縮んで隠れた入力欄は、はみ出したぶんだけ現在位置から送る', () => {
    // 現在のスクロール位置 = contentY(800) - viewportY(280) = 520
    // はみ出し = 280 + 40 + 24 - 300 = 44
    expect(
      computeFocusedInputScrollTarget({ viewportY: 280, inputHeight: 40, contentY: 800, viewportHeight: 300 }),
    ).toBe(564);
  });

  test('スクロール先が負になる場合は0で止める', () => {
    expect(
      computeFocusedInputScrollTarget({ viewportY: 290, inputHeight: 40, contentY: 0, viewportHeight: 300 }),
    ).toBe(0);
  });
});

// FormScrollProviderのテストと同じく、jest-expo環境では実ネイティブのmeasureLayout/measureは
// 呼ばれないため、測定結果を返すだけのPOJOを渡してProvider自身のオーケストレーションを検証する
const VIEWPORT = { measure: (cb: (...args: number[]) => void) => cb(0, 0, 0, VIEWPORT_HEIGHT) };
const CONTENT = {};
const VIEWPORT_HEIGHT = 300;

function makeInputNode(viewportY: number, contentY: number, height = 40) {
  return {
    measureLayout: (
      relativeTo: unknown,
      onSuccess: (x: number, y: number, width: number, height: number) => void,
    ) => {
      if (relativeTo === VIEWPORT) onSuccess(0, viewportY, 0, height);
      else onSuccess(0, contentY, 0, height);
    },
    measure: () => {},
  };
}

function makeScrollRef(scrollTo: jest.Mock) {
  return {
    current: {
      getScrollResponder: () => ({
        getNativeScrollRef: () => VIEWPORT,
        getInnerViewRef: () => CONTENT,
        scrollTo,
      }),
    },
  } as never;
}

function TestInput({ node }: { node: ReturnType<typeof makeInputNode> }) {
  const scrollFocusedInputIntoView = useScrollFocusedInputIntoView();
  // 入力欄のonFocus相当
  useEffect(() => {
    scrollFocusedInputIntoView(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('キーボードが出切ってから、隠れている入力欄が見える位置までスクロールする', async () => {
  const scrollTo = jest.fn();
  act(() => {
    create(
      <FocusedInputScrollProvider scrollRef={makeScrollRef(scrollTo)}>
        <TestInput node={makeInputNode(280, 800)} />
      </FocusedInputScrollProvider>,
    );
  });

  // キーボードが出るまでは測らない（縮む前の高さで「隠れていない」と誤判定してしまうため）
  expect(scrollTo).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(400);
  });

  expect(scrollTo).toHaveBeenCalledWith({ y: 564, animated: true });
});

test('表示領域に収まっている入力欄ではスクロールしない', async () => {
  const scrollTo = jest.fn();
  act(() => {
    create(
      <FocusedInputScrollProvider scrollRef={makeScrollRef(scrollTo)}>
        <TestInput node={makeInputNode(100, 300)} />
      </FocusedInputScrollProvider>,
    );
  });

  await act(async () => {
    jest.advanceTimersByTime(400);
  });

  expect(scrollTo).not.toHaveBeenCalled();
});

test('Provider外の入力欄では何も起きない（no-opで落ちない）', async () => {
  act(() => {
    create(<TestInput node={makeInputNode(280, 800)} />);
  });

  await act(async () => {
    jest.advanceTimersByTime(400);
  });
});
