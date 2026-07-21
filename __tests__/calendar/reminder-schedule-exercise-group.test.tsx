const mockUseRoutinePreviewExerciseCards = jest.fn();

jest.mock('@/hooks/use-routine-preview-exercise-cards', () => ({
  useRoutinePreviewExerciseCards: (...args: unknown[]) => mockUseRoutinePreviewExerciseCards(...args),
}));

import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ReminderScheduleExerciseGroup } from '@/components/calendar/reminder-schedule-exercise-group';

const onPress = jest.fn();
const onDelete = jest.fn();
const onPressStart = jest.fn();
const onReplace = jest.fn();

function render(props: Partial<Parameters<typeof ReminderScheduleExerciseGroup>[0]> = {}) {
  const merged = {
    routineId: 10,
    routineName: '胸の日',
    sessionStartedAt: new Date(2026, 6, 25, 19, 30).getTime(),
    onDelete,
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<ReminderScheduleExerciseGroup {...merged} />);
  });
  return root;
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

const benchPressExercise = {
  routineExerciseId: 100,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  source: 'preset',
  slug: 'bench_press',
  measurementType: 'weight_reps',
  sets: [{ id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
};

beforeEach(() => {
  onPress.mockClear();
  onDelete.mockClear();
  onPressStart.mockClear();
  onReplace.mockClear();
  mockUseRoutinePreviewExerciseCards.mockReturnValue({ exercises: [benchPressExercise], loaded: true });
});

// まだ実体化していないリマインダー予定の選択日パネル表示（2026-07-21）。ルーティン本体の
// 現在の中身をライブプレビューし、タップ時の実体化は呼び出し元(app/(tabs)/calendar.tsx)の責務
describe('ReminderScheduleExerciseGroup', () => {
  it('routineIdを渡してuseRoutinePreviewExerciseCardsを呼び出す', () => {
    render({ routineId: 42 });
    expect(mockUseRoutinePreviewExerciseCards).toHaveBeenCalledWith(42);
  });

  it('取得した種目を種目名付きで表示し、目標セット値(重量)も見える', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
    expect(texts.some((c) => typeof c === 'string' && c.includes('60'))).toBe(true);
  });

  it('目標セットが0件の種目は「実施記録なし」と表示する（completedAt:0センチネルを経由してもemptySetsLabelが効く）', () => {
    mockUseRoutinePreviewExerciseCards.mockReturnValue({
      exercises: [{ ...benchPressExercise, sets: [] }],
      loaded: true,
    });
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('実施記録なし');
  });

  it('loaded:falseのときは種目カードを表示しない（クラッシュしない）', () => {
    mockUseRoutinePreviewExerciseCards.mockReturnValue({ exercises: [], loaded: false });
    const root = render();
    expect(root.root.findAllByProps({ children: 'ベンチプレス' })).toHaveLength(0);
  });

  it('見出しにrouteNameがルーティン名として表示される（未実体化でも常時ルーティン名を持つ）', () => {
    const root = render({ routineName: '脚の日' });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('脚の日');
  });

  it('種目カードをタップするとonPressが呼ばれる（呼び出し元が実体化+遷移を行う想定）', () => {
    const root = render();
    const card = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
    act(() => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('⋮メニューの「削除」を押すとonDeleteが呼ばれる', () => {
    const root = render();
    const menuTrigger = findByAccessibilityLabel(root.root, '「胸の日」のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const deleteItem = findByAccessibilityLabel(root.root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('onReplaceを渡すと⋮メニューに「今回だけ差し替え」が出てタップでonReplaceが呼ばれる', () => {
    const root = render({ onReplace });
    const menuTrigger = findByAccessibilityLabel(root.root, '「胸の日」のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const replaceItem = findByAccessibilityLabel(root.root, '今回だけ差し替え')!;
    act(() => {
      replaceItem.props.onPress();
    });
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('onPressStartを渡す場合、開始ボタンが表示されタップでonPressStartが呼ばれる', () => {
    const root = render({ onPressStart });
    const startBtn = findByAccessibilityLabel(root.root, '「胸の日」のトレーニングを開始')!;
    act(() => {
      startBtn.props.onPress();
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);
  });
});
