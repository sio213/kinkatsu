// 月送りスワイプの判定と、「スナップし切ってから月を切り替える」段取り。
// 先に onChangeMonth を呼ぶと、props が反映されるまでの一瞬だけ古い月が見えて数字がズレる——
// という実機で踏んだ不具合の対処なので、順序ごと固定する。
// （曜日ラベルの重複防止は swipeable-month-view.test.tsx が見ている）
/* eslint-disable no-var */
// withTiming のスナップ完了コールバックを捕まえて、テストから任意のタイミングで発火させる。
// 実アニメーションの経過を待つとフレーム依存になり、「完了前に月が変わっていないか」を
// 確かめられない
var mockTimingCalls: { toValue: number; callback?: (finished: boolean) => void }[];

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  mockTimingCalls = [];
  return {
    ...actual,
    // スプレッドではdefault（Animated.View）が落ちるので明示的に持ち越す
    __esModule: true,
    default: actual.default,
    withTiming: (
      toValue: number,
      _config: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      mockTimingCalls.push({ toValue, callback });
      return toValue;
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { GestureDetector } from 'react-native-gesture-handler';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';

const onSelectDate = jest.fn();
const onChangeMonth = jest.fn();

const CONTAINER_WIDTH = 350;
const SLOT_GAP = 12;

function render() {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SwipeableMonthView
        year={2026}
        month={6}
        today={new Date(2026, 6, 18)}
        selectedDate={new Date(2026, 6, 18)}
        onSelectDate={onSelectDate}
        onChangeMonth={onChangeMonth}
        primaryCategoryByDay={new Map()}
        categorySetByDay={new Map()}
        primaryCategoryByScheduleDay={new Map()}
        categorySetByScheduleDay={new Map()}
        activeFilter={null}
      />,
    );
  });
  return root.root;
}

// スワイプ量の閾値と着地位置は実測した横幅を基準にするので、先に一度レイアウトを通す
function layout(root: ReactTestInstance) {
  const viewport = root
    .findByType(GestureDetector)
    .findAll((n) => typeof n.props.onLayout === 'function')[0];
  act(() => {
    viewport.props.onLayout({ nativeEvent: { layout: { width: CONTAINER_WIDTH, height: 300 } } });
  });
}

type PanHandlers = {
  onUpdate?: (e: { translationX: number }) => void;
  onEnd?: (e: { translationX: number; velocityX: number }) => void;
};

function panHandlers(root: ReactTestInstance): PanHandlers {
  const gesture = root.findByType(GestureDetector).props.gesture as { handlers: PanHandlers };
  return gesture.handlers;
}

function endPan(root: ReactTestInstance, e: { translationX: number; velocityX: number }) {
  act(() => {
    panHandlers(root).onEnd?.(e);
  });
}

/** スナップアニメーションが完了した体にする */
function finishSnap(finished = true) {
  act(() => {
    for (const call of mockTimingCalls) call.callback?.(finished);
  });
}

function setUp() {
  const root = render();
  layout(root);
  mockTimingCalls.length = 0;
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimingCalls = [];
});

describe('SwipeableMonthView の月送りスワイプ', () => {
  it('左に大きくドラッグしたら、隣のスロットまでスナップしてから翌月へ送る', () => {
    const root = setUp();

    endPan(root, { translationX: -200, velocityX: 0 });

    // 着地先は「スロット幅」ではなく「スロット幅 + 隙間」だけ離れている
    expect(mockTimingCalls[0].toValue).toBe(-(CONTAINER_WIDTH + SLOT_GAP));
    expect(onChangeMonth).not.toHaveBeenCalled();

    finishSnap();
    expect(onChangeMonth).toHaveBeenCalledWith(1);
  });

  it('右に大きくドラッグしたら前月へ送る', () => {
    const root = setUp();

    endPan(root, { translationX: 200, velocityX: 0 });
    finishSnap();

    expect(mockTimingCalls[0].toValue).toBe(CONTAINER_WIDTH + SLOT_GAP);
    expect(onChangeMonth).toHaveBeenCalledWith(-1);
  });

  it('移動量が小さくても速度が十分なら送る（フリック）', () => {
    const root = setUp();

    endPan(root, { translationX: -10, velocityX: -1200 });
    finishSnap();

    expect(onChangeMonth).toHaveBeenCalledWith(1);
  });

  it('移動量も速度も足りなければ元の位置へ戻すだけで、月は変えない', () => {
    const root = setUp();

    endPan(root, { translationX: -10, velocityX: -10 });
    finishSnap();

    expect(mockTimingCalls[0].toValue).toBe(0);
    expect(onChangeMonth).not.toHaveBeenCalled();
  });

  it('スナップが途中で中断されたら月を変えない', () => {
    const root = setUp();

    endPan(root, { translationX: -200, velocityX: 0 });
    finishSnap(false);

    expect(onChangeMonth).not.toHaveBeenCalled();
  });

  it('ドラッグ中は月を変えないしスナップも始めない（指を離すまで確定しない）', () => {
    const root = setUp();

    act(() => {
      panHandlers(root).onUpdate?.({ translationX: -300 });
    });

    expect(mockTimingCalls).toHaveLength(0);
    expect(onChangeMonth).not.toHaveBeenCalled();
  });
});
