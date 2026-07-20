const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseScheduledWorkoutExercises = jest.fn();
const mockUseScheduledWorkoutTime = jest.fn();
const mockRemoveScheduledWorkoutExercise = jest.fn();
const mockMoveScheduledWorkoutExercise = jest.fn();
const mockAddScheduledWorkoutSet = jest.fn();
const mockDeleteLastScheduledWorkoutSet = jest.fn();
const mockDeleteScheduledWorkoutSet = jest.fn();
const mockUpdateScheduledWorkoutSetValues = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('@/hooks/use-scheduled-workout-exercises', () => ({
  useScheduledWorkoutExercises: (...args: unknown[]) => mockUseScheduledWorkoutExercises(...args),
}));

jest.mock('@/hooks/use-scheduled-workout', () => ({
  useScheduledWorkoutTime: (...args: unknown[]) => mockUseScheduledWorkoutTime(...args),
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  removeScheduledWorkoutExercise: (...args: unknown[]) => mockRemoveScheduledWorkoutExercise(...args),
  moveScheduledWorkoutExercise: (...args: unknown[]) => mockMoveScheduledWorkoutExercise(...args),
  addScheduledWorkoutSet: (...args: unknown[]) => mockAddScheduledWorkoutSet(...args),
  deleteLastScheduledWorkoutSet: (...args: unknown[]) => mockDeleteLastScheduledWorkoutSet(...args),
  deleteScheduledWorkoutSet: (...args: unknown[]) => mockDeleteScheduledWorkoutSet(...args),
  updateScheduledWorkoutSetValues: (...args: unknown[]) => mockUpdateScheduledWorkoutSetValues(...args),
}));

import ScheduleWorkoutEditScreen from '@/app/calendar/schedule-workout-edit';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';

function benchExercise() {
  return {
    scheduledWorkoutExerciseId: 100,
    exerciseId: 1,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench_press',
    sets: [{ id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
  };
}

function squatExercise() {
  return {
    scheduledWorkoutExerciseId: 101,
    exerciseId: 2,
    name: 'スクワット',
    category: 'leg',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'squat',
    sets: [],
  };
}

function findMenuTriggers(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity).filter((t) => t.props.accessibilityLabel === 'メニューを開く');
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) => btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label));
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutEditScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: '5' });
  mockUseScheduledWorkoutExercises.mockReturnValue([benchExercise(), squatExercise()]);
  mockUseScheduledWorkoutTime.mockReturnValue({ scheduledDate: '2026-07-21', hour: 19, minute: 30 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// 直接予定の種目一覧・目標セットをまとめて編集する画面（app/routine/exercise-edit.tsxのカレンダー版、
// 2026-07-20新設）。まだ実施していない記録のため完了ボタンを持たず、フッターは「戻る」のみ
describe('ScheduleWorkoutEditScreen', () => {
  it('各種目のカードと設定済みの目標セットを表示する', () => {
    const root = render();
    expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
    expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
  });

  it('完了ボタンは無く、フッターは「戻る」のみで押すとrouter.back()する', () => {
    const root = render();
    expect(root.findAllByType(Text).map((t) => t.props.children)).not.toContain('完了');
    expect(root.findAllByType(Text).map((t) => t.props.children)).not.toContain('トレーニングを終了');

    const backBtn = findButtonByLabel(root, '戻る')!;
    act(() => {
      backBtn.props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('ヘッダー⋮「種目を追加」を押すとscheduledWorkoutId付きでschedule-workout-add-exerciseへ遷移する', () => {
    const root = render();
    const headerMenuTrigger = root
      .findAllByType(TouchableOpacity)
      .find((t) => t.props.accessibilityLabel === '種目編集のメニューを開く')!;
    act(() => {
      headerMenuTrigger.props.onPress();
    });
    const addItem = findMenuItem(root, '種目を追加')!;
    act(() => {
      addItem.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-add-exercise',
      params: { scheduledWorkoutId: '5' },
    });
  });

  it('種目カード⋮「削除」→確認Alertで確定するとremoveScheduledWorkoutExerciseが呼ばれる', async () => {
    const root = render();
    const triggers = findMenuTriggers(root);
    act(() => {
      triggers[0].props.onPress();
    });
    const deleteItem = findMenuItem(root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
    await act(async () => {
      await confirmAction.onPress();
    });
    expect(mockRemoveScheduledWorkoutExercise).toHaveBeenCalledWith(100);
  });

  it('最後の1種目の削除に失敗した場合（安全網エラー）はエラーAlertを表示する', async () => {
    mockRemoveScheduledWorkoutExercise.mockRejectedValueOnce(new Error('cannot remove the last exercise'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const root = render();
    const triggers = findMenuTriggers(root);
    act(() => {
      triggers[0].props.onPress();
    });
    const deleteItem = findMenuItem(root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
    await act(async () => {
      await confirmAction.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith('エラー', 'この予定には最低1種目が必要なため削除できませんでした。');
  });

  it('種目カード⋮「種目を入れ替え」を押すとscheduledWorkoutExerciseId付きでschedule-workout-exercise-swapへ遷移する', () => {
    const root = render();
    const triggers = findMenuTriggers(root);
    act(() => {
      triggers[0].props.onPress();
    });
    const swapItem = findMenuItem(root, '種目を入れ替え')!;
    act(() => {
      swapItem.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-exercise-swap',
      params: {
        scheduledWorkoutExerciseId: '100',
        currentExerciseId: '1',
        currentExerciseName: 'ベンチプレス',
        hasRecordedData: 'true',
      },
    });
  });

  it('先頭カードは「上へ移動」が無効、末尾カードは「下へ移動」が無効になる', () => {
    const root = render();
    const triggers = findMenuTriggers(root);
    act(() => {
      triggers[0].props.onPress();
    });
    expect(findMenuItem(root, '上へ移動')!.props.disabled).toBe(true);
    expect(findMenuItem(root, '下へ移動')!.props.disabled).toBe(false);
  });

  it('「上へ移動」を押すとmoveScheduledWorkoutExerciseが呼ばれる', () => {
    const root = render();
    const triggers = findMenuTriggers(root);
    act(() => {
      triggers[1].props.onPress();
    });
    const upItem = findMenuItem(root, '上へ移動')!;
    act(() => {
      upItem.props.onPress();
    });
    expect(mockMoveScheduledWorkoutExercise).toHaveBeenCalledWith(5, 101, 'up');
  });

  it('「セット追加」「セット削除」ボタンでそれぞれの関数が呼ばれる', () => {
    const root = render();
    const addSetBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'セット追加');
    act(() => {
      addSetBtn!.props.onPress();
    });
    expect(mockAddScheduledWorkoutSet).toHaveBeenCalledWith(100);

    const deleteSetBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'セット削除');
    act(() => {
      deleteSetBtn!.props.onPress();
    });
    expect(mockDeleteLastScheduledWorkoutSet).toHaveBeenCalledWith(100);
  });
});
