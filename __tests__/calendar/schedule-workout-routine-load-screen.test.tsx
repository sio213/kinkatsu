const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockGetRoutineDetail = jest.fn();
const mockAddRoutineExercisesToScheduledWorkout = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

// lib/routines/db.tsはトップレベルで@/db/client(expo-sqlite依存)まで読み込むため、
// routine-load-screen.test.tsxと同じ理由でモジュールごとモックする
jest.mock('@/lib/routines/db', () => ({
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  addRoutineExercisesToScheduledWorkout: (...args: unknown[]) => mockAddRoutineExercisesToScheduledWorkout(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, Alert, Text, TouchableOpacity } from 'react-native';
import ScheduleWorkoutRoutineLoadScreen from '@/app/calendar/schedule-workout-routine-load';
import type { RoutineDetailExercise } from '@/lib/routines/db';

function exercise(overrides: Partial<RoutineDetailExercise> = {}): RoutineDetailExercise {
  return {
    id: 501,
    routineId: 1,
    exerciseId: 10,
    orderIndex: 0,
    createdAt: 0,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench_press',
    sets: [{ id: 1, routineExerciseId: 501, setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, createdAt: 0 }],
    ...overrides,
  };
}

const benchExercise = exercise({ id: 501, exerciseId: 10, name: 'ベンチプレス', category: 'chest' });
const flyExercise = exercise({
  id: 502,
  exerciseId: 11,
  name: 'ダンベルフライ',
  category: 'chest',
  sets: [{ id: 2, routineExerciseId: 502, setNumber: 1, weight: 14, reps: 12, durationSeconds: null, distanceMeters: null, createdAt: 0 }],
});

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === label);
}

function findSubmitButton(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) =>
      btn.findAllByType(Text).some((t) => typeof t.props.children === 'string' && t.props.children.endsWith('読み込む')),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutRoutineLoadScreen));
  });
  return instance.root;
}

async function renderResolved(exercises: RoutineDetailExercise[] | Error) {
  if (exercises instanceof Error) {
    mockGetRoutineDetail.mockRejectedValue(exercises);
  } else {
    mockGetRoutineDetail.mockResolvedValue({ routine: { id: 1, name: '胸トレ' }, reminder: null, exercises });
  }
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: '5', routineId: '1', routineName: '胸トレ' });
  mockAddRoutineExercisesToScheduledWorkout.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ヘッダー⋮「ルーティンから読み込む」フローの画面3。app/workout/routine-load.tsxのカレンダー版
// （2026-07-21新設）
describe('ScheduleWorkoutRoutineLoadScreen', () => {
  test('ヘッダーにルーティン名をサブタイトルとして表示する', async () => {
    const root = await renderResolved([benchExercise]);
    expect(root.findByProps({ children: 'このルーティンから読み込み' })).toBeDefined();
    expect(root.findByProps({ children: '胸トレ' })).toBeDefined();
  });

  test('取得成功なら全種目が初期状態で選択済みになる', async () => {
    const root = await renderResolved([benchExercise, flyExercise]);
    expect(root.findByProps({ children: '2 / 2' })).toBeDefined();
    expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
  });

  test('種目のチェックを外すと件数・ボタン文言が更新される', async () => {
    const root = await renderResolved([benchExercise, flyExercise]);
    const flyRow = root
      .findAllByType(TouchableOpacity)
      .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
    act(() => {
      flyRow.props.onPress();
    });
    expect(root.findByProps({ children: '1 / 2' })).toBeDefined();
    expect(root.findByProps({ children: '1種目を読み込む' })).toBeDefined();
  });

  test('全選択チェックを外すと全解除され、送信ボタンがdisabledになる', async () => {
    const root = await renderResolved([benchExercise]);
    const selectAll = findByLabel(root, '全選択')!;
    act(() => {
      selectAll.props.onPress();
    });
    const submitBtn = findSubmitButton(root)!;
    expect(submitBtn.props.disabled).toBe(true);
  });

  test('送信するとaddRoutineExercisesToScheduledWorkoutに選択した種目を渡し、成功後にdismiss(2)する', async () => {
    const root = await renderResolved([benchExercise, flyExercise]);
    const submitBtn = findSubmitButton(root)!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddRoutineExercisesToScheduledWorkout).toHaveBeenCalledWith(5, 1, [
      { routineExerciseId: 501 },
      { routineExerciseId: 502 },
    ]);
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  test('中央の種目だけ選択解除しても、送信されるselectionsの並びは表示順(orderIndex順)を保つ', async () => {
    const curlExercise = exercise({
      id: 503,
      exerciseId: 12,
      name: 'アームカール',
      category: 'arm',
      sets: [{ id: 3, routineExerciseId: 503, setNumber: 1, weight: 10, reps: 12, durationSeconds: null, distanceMeters: null, createdAt: 0 }],
    });
    const root = await renderResolved([benchExercise, flyExercise, curlExercise]);
    const flyRow = root
      .findAllByType(TouchableOpacity)
      .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
    act(() => {
      flyRow.props.onPress();
    });
    const submitBtn = findSubmitButton(root)!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockAddRoutineExercisesToScheduledWorkout).toHaveBeenCalledWith(5, 1, [
      { routineExerciseId: 501 },
      { routineExerciseId: 503 },
    ]);
  });

  test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
    const root = await renderResolved([benchExercise]);
    mockAddRoutineExercisesToScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
    const submitBtn = findSubmitButton(root)!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を読み込めませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  test('連打してもaddRoutineExercisesToScheduledWorkoutは1回しか呼ばれない', async () => {
    const root = await renderResolved([benchExercise]);
    let resolveAdd!: () => void;
    mockAddRoutineExercisesToScheduledWorkout.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAdd = resolve;
      }),
    );
    const submitBtn = findSubmitButton(root)!;
    act(() => {
      submitBtn.props.onPress();
      submitBtn.props.onPress();
    });
    expect(mockAddRoutineExercisesToScheduledWorkout).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAdd();
    });
  });

  test('取得失敗時はエラーメッセージと再試行ボタンを表示する', async () => {
    const root = await renderResolved(new Error('fail'));
    expect(root.findByProps({ children: 'ルーティンを読み込めませんでした' })).toBeDefined();
  });

  test('取得中はActivityIndicatorを表示し、ヘッダー・フッターは非表示', () => {
    mockGetRoutineDetail.mockReturnValue(new Promise(() => {}));
    const root = render();
    expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(() => root.findByProps({ children: 'すべて読み込む' })).toThrow();
  });

  test('scheduledWorkoutId/routineIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: 'abc', routineId: '1', routineName: '胸トレ' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
    expect(mockGetRoutineDetail).not.toHaveBeenCalled();
  });
});
