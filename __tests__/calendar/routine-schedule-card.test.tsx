import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { RoutineScheduleCard } from '@/components/calendar/routine-schedule-card';

const onPress = jest.fn();
const onPressStart = jest.fn();
const onDelete = jest.fn();
const onSkip = jest.fn();

function render(props: Partial<Parameters<typeof RoutineScheduleCard>[0]> = {}) {
  const merged = {
    routineName: '胸の日',
    categories: ['chest', 'shoulder'],
    exerciseCount: 4,
    timeLabel: '毎週 日曜 07:00',
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<RoutineScheduleCard {...merged} />);
  });
  return root;
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

beforeEach(() => {
  onPress.mockClear();
  onPressStart.mockClear();
  onDelete.mockClear();
  onSkip.mockClear();
});

describe('RoutineScheduleCard', () => {
  it('ルーティン名・種目数・時刻ラベルを表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('胸の日');
    expect(texts).toContain('4種目');
    expect(texts).toContain('毎週 日曜 07:00');
  });

  it('onPressStartが無い場合、カード全体をタップするとonPressが呼ばれ、開始ボタンは無い', () => {
    const root = render();
    act(() => {
      root.root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(root.root.findAllByType(TouchableOpacity)).toHaveLength(1);
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('開始');
  });

  it('onPressStartがある場合（今日自身の予定）、カード行と開始ボタンが別々にあり、開始ボタン押下でonPressStartが呼ばれる', () => {
    const root = render({ onPressStart });
    const touchables = root.root.findAllByType(TouchableOpacity);
    // 1つ目がカード行、最後がPrimaryButton(内部でTouchableOpacityを使う)の開始ボタン
    expect(touchables.length).toBeGreaterThanOrEqual(2);
    act(() => {
      touchables[0].props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPressStart).not.toHaveBeenCalled();

    act(() => {
      touchables[touchables.length - 1].props.onPress();
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);

    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('開始');
  });

  it('accessibilityLabelにルーティン名・カテゴリ・種目数・時刻ラベルを含む（routine-card.tsxの一覧カードと同じ構成）', () => {
    const root = render();
    const label = root.root.findByType(TouchableOpacity).props.accessibilityLabel as string;
    expect(label).toBe('胸の日、胸・肩、4種目、毎週 日曜 07:00');
  });

  it('onPressStartがある場合、開始ボタンにルーティン名入りのaccessibilityLabelが明示される（複数予定カードが並んでも区別できるように）', () => {
    const root = render({ onPressStart });
    const touchables = root.root.findAllByType(TouchableOpacity);
    const startButton = touchables[touchables.length - 1];
    expect(startButton.props.accessibilityLabel).toBe('「胸の日」のトレーニングを開始');
  });

  it('カテゴリが3つを超える場合、超過分は「+N」表示になる（routine-card.tsxのsummarizeCategoriesと同じ挙動）', () => {
    const root = render({ categories: ['chest', 'shoulder', 'arm', 'back'] });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('+1');
  });

  it('oneTime=trueの場合、「1回のみ」バッジを表示し、accessibilityLabelにも含める（手動予定とリマインダー予定の区別、PR10）', () => {
    const root = render({ oneTime: true, timeLabel: '19:30' });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('1回のみ');
    const label = root.root.findByType(TouchableOpacity).props.accessibilityLabel as string;
    expect(label).toBe('胸の日、胸・肩、4種目、19:30、1回のみ');
  });

  it('oneTimeを省略した場合（リマインダー予定）、「1回のみ」バッジは表示されない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('1回のみ');
  });

  describe('⋮メニュー(onDelete、PR10-3)', () => {
    it('onDeleteを渡さない場合（リマインダー予定）、⋮メニューは表示されない', () => {
      const root = render();
      expect(findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')).toBeUndefined();
    });

    it('onDeleteを渡した場合（手動予定）、⋮メニューが表示される（accessibilityLabelにルーティン名を含み、複数カードが並んでも区別できる）', () => {
      const root = render({ onDelete });
      expect(findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')).toBeDefined();
    });

    it('⋮メニューを開いて「削除」を押すとonDeleteが呼ばれ、カード本体のonPressは呼ばれない', () => {
      const root = render({ onDelete });
      const menuTrigger = findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!;
      act(() => {
        menuTrigger.props.onPress();
      });

      const deleteItem = findByAccessibilityLabel(root.root, '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('「削除」を押した後、メニュー自体が閉じる', () => {
      const root = render({ onDelete });
      act(() => {
        findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '削除')).toBeDefined();

      act(() => {
        findByAccessibilityLabel(root.root, '削除')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '削除')).toBeUndefined();
    });

    it('onPressStartがある場合（今日自身の予定）でもonDeleteを渡せば⋮メニューが表示される', () => {
      const root = render({ onPressStart, onDelete });
      expect(findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')).toBeDefined();
    });
  });

  describe('⋮メニュー(onSkip、PR10-6a)', () => {
    it('onSkipを渡した場合（リマインダー予定）、⋮メニューが表示される', () => {
      const root = render({ onSkip });
      expect(findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')).toBeDefined();
    });

    it('onSkipを渡した場合、メニューには「今回だけスキップ」のみで「削除」は出ない', () => {
      const root = render({ onSkip });
      act(() => {
        findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '今回だけスキップ')).toBeDefined();
      expect(findByAccessibilityLabel(root.root, '削除')).toBeUndefined();
    });

    it('⋮メニューを開いて「今回だけスキップ」を押すとonSkipが呼ばれ、カード本体のonPressは呼ばれない', () => {
      const root = render({ onSkip });
      act(() => {
        findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!.props.onPress();
      });
      act(() => {
        findByAccessibilityLabel(root.root, '今回だけスキップ')!.props.onPress();
      });
      expect(onSkip).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('「今回だけスキップ」を押した後、メニュー自体が閉じる', () => {
      const root = render({ onSkip });
      act(() => {
        findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '今回だけスキップ')).toBeDefined();

      act(() => {
        findByAccessibilityLabel(root.root, '今回だけスキップ')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '今回だけスキップ')).toBeUndefined();
    });

    it('onDeleteとonSkipが両方渡された場合、onDeleteが優先される（現状の実装仕様の明文化。呼び出し側は常に排他的に渡すため実運用では起きない）', () => {
      const root = render({ onDelete, onSkip });
      act(() => {
        findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')!.props.onPress();
      });
      expect(findByAccessibilityLabel(root.root, '削除')).toBeDefined();
      expect(findByAccessibilityLabel(root.root, '今回だけスキップ')).toBeUndefined();
    });

    it('onDelete/onSkipどちらも無ければ⋮メニューは表示されない', () => {
      const root = render();
      expect(findByAccessibilityLabel(root.root, '「胸の日」毎週 日曜 07:00のメニューを開く')).toBeUndefined();
    });
  });
});
