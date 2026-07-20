const mockUseScheduledExerciseCards = jest.fn();

jest.mock('@/hooks/use-scheduled-exercise-cards', () => ({
  useScheduledExerciseCards: (...args: unknown[]) => mockUseScheduledExerciseCards(...args),
}));

import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { DirectScheduleExerciseGroup } from '@/components/calendar/direct-schedule-exercise-group';

const onPress = jest.fn();
const onDelete = jest.fn();
const onPressStart = jest.fn();

function render(props: Partial<Parameters<typeof DirectScheduleExerciseGroup>[0]> = {}) {
  const merged = {
    scheduledWorkoutId: 5,
    sessionStartedAt: new Date(2026, 6, 25, 19, 30).getTime(),
    title: 'ベンチプレス 他1種目',
    onDelete,
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<DirectScheduleExerciseGroup {...merged} />);
  });
  return root;
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

const benchPressCard = {
  scheduledWorkoutExerciseId: 200,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  source: 'preset',
  slug: 'bench_press',
  measurementType: 'weight_reps',
  sets: [],
};

beforeEach(() => {
  onPress.mockClear();
  onDelete.mockClear();
  onPressStart.mockClear();
  mockUseScheduledExerciseCards.mockReturnValue({ cards: [benchPressCard], retry: jest.fn() });
});

// カレンダーの「直接追加」予定（routineId===null）の選択日パネル表示。過去の記録と同じ
// 種目一覧カード(CalendarExerciseCard)を並べる（@ユーザー指摘、2026-07-20）
describe('DirectScheduleExerciseGroup', () => {
  it('取得した種目カードを種目名付きで表示し、まだ実施していないため自己ベストバッジは出さない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
    expect(texts).not.toContain('自己ベスト');
  });

  it('scheduledWorkoutIdを渡してフックを呼び出す', () => {
    render({ scheduledWorkoutId: 42 });
    expect(mockUseScheduledExerciseCards).toHaveBeenCalledWith(42);
  });

  it('種目カードをタップすると、種目idを問わずonPressが呼ばれる（この予定の種目をまとめて編集する画面へ遷移、@ユーザー指摘）', () => {
    const root = render();
    const card = root.root.findAllByType(TouchableOpacity).find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
    act(() => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('種目カードが複数あれば、どのカードをタップしても同じonPressが呼ばれる', () => {
    mockUseScheduledExerciseCards.mockReturnValue({
      cards: [
        benchPressCard,
        { ...benchPressCard, scheduledWorkoutExerciseId: 201, exerciseId: 11, name: 'スクワット', category: 'leg' },
      ],
      retry: jest.fn(),
    });
    const root = render();
    const cards = root.root
      .findAllByType(TouchableOpacity)
      .filter((t) => typeof t.props.accessibilityLabel === 'string' && (t.props.accessibilityLabel.startsWith('ベンチプレス、') || t.props.accessibilityLabel.startsWith('スクワット、')));
    expect(cards).toHaveLength(2);
    act(() => {
      cards[1].props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cardsがnull（読み込み中）のときは種目カードを表示しない（クラッシュしない）', () => {
    mockUseScheduledExerciseCards.mockReturnValue({ cards: null, retry: jest.fn() });
    const root = render();
    expect(root.root.findAllByProps({ children: 'ベンチプレス' })).toHaveLength(0);
  });

  it("cardsが'error'のときはエラー文言と再試行ボタンを表示し、押すとretryが呼ばれる", () => {
    const retry = jest.fn();
    mockUseScheduledExerciseCards.mockReturnValue({ cards: 'error', retry });
    const root = render();
    expect(root.root.findByProps({ children: '種目を読み込めませんでした' })).toBeDefined();

    const retryBtn = findByAccessibilityLabel(root.root, '再試行')!;
    act(() => {
      retryBtn.props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('目標セット（重量・回数）が設定済みならそれをそのまま表示する（フックが目標セットを優先して返す前提、@ユーザー指摘2026-07-21）', () => {
    mockUseScheduledExerciseCards.mockReturnValue({
      cards: [
        {
          ...benchPressCard,
          sets: [{ weight: 70, reps: 6, durationSeconds: null, distanceMeters: null, completedAt: 0 }],
        },
      ],
      retry: jest.fn(),
    });
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts.some((c) => typeof c === 'string' && c.includes('70'))).toBe(true);
  });

  it('一度も実施したことが無い種目（sets空）は「実施記録なし」と表示する（@designer指摘: 「0セット」だと記録し忘れと誤読される、2026-07-20）', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('実施記録なし');
    expect(texts).not.toContain('0セット');
  });

  it('⋮メニューの「削除」を押すとonDeleteが呼ばれる', () => {
    const root = render();
    const menuTrigger = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const deleteItem = findByAccessibilityLabel(root.root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('onPressStartを渡さない場合（未来日）、開始ボタンは表示されない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('開始');
  });

  it('onPressStartを渡す場合（今日自身の予定）、開始ボタンが表示されタップでonPressStartが呼ばれる', () => {
    const root = render({ onPressStart });
    const startBtn = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」のトレーニングを開始')!;
    act(() => {
      startBtn.props.onPress();
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);
  });
});
