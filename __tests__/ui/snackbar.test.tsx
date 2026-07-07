import { Snackbar } from '@/components/ui/snackbar';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

function render(props: Partial<Parameters<typeof Snackbar>[0]> & { visible: boolean; message: string }) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<Snackbar onDismiss={jest.fn()} {...props} />);
  });
  return instance.root;
}

function findAction(root: ReactTestInstance) {
  return root.findByProps({ accessibilityRole: 'button' });
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

describe('Snackbar', () => {
  test('visible=falseのときは何も描画しない', () => {
    const root = render({ visible: false, message: '前回のセットを挿入' });
    expect(root.findAllByType('View' as any).length).toBe(0);
  });

  test('visible=trueのときメッセージを表示する', () => {
    const root = render({ visible: true, message: '前回のセットを挿入' });
    expect(root.findByProps({ children: '前回のセットを挿入' })).toBeTruthy();
  });

  test('actionLabel/onPressActionが無ければアクションボタンは描画しない', () => {
    const root = render({ visible: true, message: '前回のセットを挿入' });
    expect(() => findAction(root)).toThrow();
  });

  test('アクションボタン押下でonPressActionが呼ばれる（onDismissは自動では呼ばれない）', () => {
    const onPressAction = jest.fn();
    const onDismiss = jest.fn();
    const root = render({
      visible: true,
      message: '前回のセットを挿入',
      actionLabel: '元に戻す',
      onPressAction,
      onDismiss,
    });

    act(() => {
      findAction(root).props.onPress();
    });
    expect(onPressAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe('自動消滅タイマー', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    test('duration経過後にonDismissが呼ばれる', () => {
      const onDismiss = jest.fn();
      render({ visible: true, message: 'A', onDismiss, duration: 4000 });

      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('表示中にmessageだけが変わると、タイマーは最新表示から仕切り直しになる', () => {
      const onDismiss = jest.fn();
      let instance!: ReturnType<typeof create>;
      act(() => {
        instance = create(
          <Snackbar visible message="A" onDismiss={onDismiss} duration={4000} />,
        );
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      act(() => {
        instance.update(<Snackbar visible message="B" onDismiss={onDismiss} duration={4000} />);
      });
      // メッセージ変更時点から4000ms経っていなければまだ消えない
      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('visible=falseの間はタイマーが動かない', () => {
      const onDismiss = jest.fn();
      render({ visible: false, message: 'A', onDismiss, duration: 4000 });

      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    test('armed=falseの間はvisible=trueでもタイマーが動かない（画面外でスクロール待ちの状態を想定）', () => {
      const onDismiss = jest.fn();
      render({ visible: true, armed: false, message: 'A', onDismiss, duration: 4000 });

      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    test('armedがfalse→trueに変わった時点からduration経過後にonDismissが呼ばれる（見えてから数える）', () => {
      const onDismiss = jest.fn();
      let instance!: ReturnType<typeof create>;
      act(() => {
        instance = create(
          <Snackbar visible armed={false} message="A" onDismiss={onDismiss} duration={4000} />,
        );
      });

      // armed=falseのままどれだけ時間が経ってもタイマーは進んでいない
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        instance.update(<Snackbar visible armed message="A" onDismiss={onDismiss} duration={4000} />);
      });
      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクセシビリティ', () => {
    test('visible=trueになるとAccessibilityInfo.announceForAccessibilityが呼ばれる（iOSのVoiceOverはaccessibilityLiveRegionが効かないため）', () => {
      render({ visible: true, message: '前回のセットを挿入', actionLabel: '元に戻す', onPressAction: jest.fn() });
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
        '前回のセットを挿入。元に戻すボタンあり',
      );
    });

    test('actionLabelが無ければメッセージのみ読み上げる', () => {
      render({ visible: true, message: '前回のセットを挿入' });
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('前回のセットを挿入');
    });
  });
});
