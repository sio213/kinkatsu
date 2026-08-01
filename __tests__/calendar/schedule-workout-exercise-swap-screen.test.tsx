// 予定の種目入れ替え画面（app/routine/exercise-swap.tsx のカレンダー版）。
// 選択UIは ExerciseSwapPicker を共有していて routine-exercise-swap-screen.test.tsx が見ているので、
// ここはこの画面が担っている「URLパラメータの解釈」と「確定時のDB書き込み」に絞る。
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockReplaceScheduledWorkoutExercise = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  replaceScheduledWorkoutExercise: (...args: unknown[]) =>
    mockReplaceScheduledWorkoutExercise(...args),
}));

// ピッカー本体は種目一覧・利用統計経由で db/client（expo-sqlite）へ辿るため、
// 受け取ったpropsを覗けるダミーに置き換える
jest.mock('@/components/exercises/exercise-swap-picker', () => ({
  ExerciseSwapPicker: 'ExerciseSwapPicker',
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text } from 'react-native';
import ScheduleWorkoutExerciseSwapScreen from '@/app/calendar/schedule-workout-exercise-swap';

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutExerciseSwapScreen));
  });
  return instance.root;
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat();
}

function picker(root: ReactTestInstance) {
  return root.findByType('ExerciseSwapPicker' as unknown as React.ComponentType);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    scheduledWorkoutExerciseId: '5',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  mockReplaceScheduledWorkoutExercise.mockResolvedValue(undefined);
});

describe('ScheduleWorkoutExerciseSwapScreen', () => {
  it('現在の種目の情報をピッカーへ渡す', () => {
    const props = picker(render()).props;

    expect(props).toMatchObject({
      currentExerciseId: 10,
      currentExerciseName: 'ベンチプレス',
      hasRecordedData: false,
      confirmMessage: '設定済みの目標セットは失われます。',
    });
  });

  it('hasRecordedData は文字列 "true" のときだけ true にする', () => {
    mockUseLocalSearchParams.mockReturnValue({
      scheduledWorkoutExerciseId: '5',
      currentExerciseId: '10',
      currentExerciseName: 'ベンチプレス',
      hasRecordedData: 'true',
    });

    expect(picker(render()).props.hasRecordedData).toBe(true);
  });

  it('種目を選ぶと予定の行を差し替えてから前の画面へ戻る', async () => {
    const props = picker(render()).props;

    await act(async () => {
      await props.onSubmit({ id: 22, name: 'インクラインベンチプレス' });
    });

    expect(mockReplaceScheduledWorkoutExercise).toHaveBeenCalledWith(5, 22);
    expect(mockBack).toHaveBeenCalled();
  });

  it('対象IDが数値でなければ、戻る導線つきの見つかりません表示に切り替える', () => {
    mockUseLocalSearchParams.mockReturnValue({
      scheduledWorkoutExerciseId: undefined,
      currentExerciseId: '10',
      currentExerciseName: 'ベンチプレス',
      hasRecordedData: 'false',
    });

    const root = render();

    expect(allTexts(root)).toContain('種目が見つかりません');
    expect(
      root.findAllByType('ExerciseSwapPicker' as unknown as React.ComponentType),
    ).toHaveLength(0);
  });
});
