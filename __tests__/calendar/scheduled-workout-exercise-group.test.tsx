const mockUseScheduledExerciseCards = jest.fn();

jest.mock('@/hooks/use-scheduled-exercise-cards', () => ({
  useScheduledExerciseCards: (...args: unknown[]) => mockUseScheduledExerciseCards(...args),
}));

import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ScheduledWorkoutExerciseGroup } from '@/components/calendar/scheduled-workout-exercise-group';

const onPress = jest.fn();
const onDelete = jest.fn();
const onPressStart = jest.fn();

function render(props: Partial<Parameters<typeof ScheduledWorkoutExerciseGroup>[0]> = {}) {
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
    root = create(<ScheduledWorkoutExerciseGroup {...merged} />);
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

// scheduledWorkoutId実体を持つ予定（直接予定、および実体化済みルーティン予定）共通の
// 選択日パネル表示（2026-07-21、旧DirectScheduleExerciseGroupを一般化した薄いコンテナ）
describe('ScheduledWorkoutExerciseGroup', () => {
  it('scheduledWorkoutIdを渡してuseScheduledExerciseCardsを呼び出し、種目カードを表示する', () => {
    render({ scheduledWorkoutId: 42 });
    expect(mockUseScheduledExerciseCards).toHaveBeenCalledWith(42);
  });

  it('取得した種目カードを種目名付きで表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
  });

  it('種目カードをタップするとonPressが呼ばれる', () => {
    const root = render();
    const card = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
    act(() => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("cardsが'error'のときは再試行ボタンを表示し、押すとフックのretryが呼ばれる", () => {
    const retry = jest.fn();
    mockUseScheduledExerciseCards.mockReturnValue({ cards: 'error', retry });
    const root = render();
    const retryBtn = findByAccessibilityLabel(root.root, '再試行')!;
    act(() => {
      retryBtn.props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('cardsがnull（読み込み中）のときは種目カードを表示しない（クラッシュしない）', () => {
    mockUseScheduledExerciseCards.mockReturnValue({ cards: null, retry: jest.fn() });
    const root = render();
    expect(root.root.findAllByProps({ children: 'ベンチプレス' })).toHaveLength(0);
  });

  it('⋮メニューの「削除」を押すとonDeleteが呼ばれる', () => {
    const root = render();
    const menuTrigger = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const deleteItem = findByAccessibilityLabel(root.root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('onPressStartを渡す場合、開始ボタンが表示されタップでonPressStartが呼ばれる', () => {
    const root = render({ onPressStart });
    const startBtn = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のトレーニングを開始')!;
    act(() => {
      startBtn.props.onPress();
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);
  });

  // 実体化済みルーティン予定のときだけ呼び出し元がroutineNameを渡す（2026-07-21）
  it('routineNameを渡すと見出しに表示される（実体化済みルーティン予定）', () => {
    const root = render({ routineName: '胸の日' });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('胸の日');
  });

  it('routineNameを渡さない場合（直接予定）、見出しにルーティン名は表示されない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('胸の日');
  });
});
