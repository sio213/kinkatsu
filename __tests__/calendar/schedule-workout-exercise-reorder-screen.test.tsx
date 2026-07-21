const mockBack = jest.fn();
const mockUseScheduledWorkoutExercises = jest.fn();
const mockReorderScheduledWorkoutExercises = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ scheduledWorkoutId: '5' }),
}));

jest.mock('@/hooks/use-scheduled-workout-exercises', () => ({
  useScheduledWorkoutExercises: (...args: unknown[]) => mockUseScheduledWorkoutExercises(...args),
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  reorderScheduledWorkoutExercises: (...args: unknown[]) => mockReorderScheduledWorkoutExercises(...args),
}));

import ScheduleWorkoutExerciseReorderScreen from '@/app/calendar/schedule-workout-exercise-reorder';
import type { ScheduledWorkoutExerciseDetail } from '@/hooks/use-scheduled-workout-exercises';
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import ReorderableList from 'react-native-reorderable-list';

function makeExercise(
  scheduledWorkoutExerciseId: number,
  overrides: Partial<ScheduledWorkoutExerciseDetail> = {},
): ScheduledWorkoutExerciseDetail {
  return {
    scheduledWorkoutExerciseId,
    exerciseId: scheduledWorkoutExerciseId,
    name: `種目${scheduledWorkoutExerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [],
    ...overrides,
  };
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(ScheduleWorkoutExerciseReorderScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseScheduledWorkoutExercises.mockReturnValue([]);
  mockReorderScheduledWorkoutExercises.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

// ヘッダー⋮「並び替え」(app/calendar/schedule-workout-edit.tsx)から開く専用画面。
// app/workout/exercise-reorder.tsxのカレンダー版（2026-07-21新設）
describe('ScheduleWorkoutExerciseReorderScreen', () => {
  test('予定の全種目分の行が表示される', () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      makeExercise(100, { name: '種目100' }),
      makeExercise(101, { name: '種目101' }),
    ]);
    const root = render();

    expect(root.findByProps({ children: '種目100' })).toBeDefined();
    expect(root.findByProps({ children: '種目101' })).toBeDefined();
  });

  test('戻るを押すとrouter.backが呼ばれる', () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100)]);
    const root = render();
    const backBtn = findButtonByLabel(root, '戻る')!;

    act(() => {
      backBtn.props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();
  });

  test('ドラッグで並び替えると、scheduledWorkoutIdと新しい順序でreorderScheduledWorkoutExercisesが呼ばれる(先頭→末尾)', () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100), makeExercise(101), makeExercise(102)]);
    const root = render();
    const list = root.findByType(ReorderableList);

    act(() => {
      list.props.onReorder({ from: 0, to: 2 });
    });

    expect(mockReorderScheduledWorkoutExercises).toHaveBeenCalledWith(5, [101, 102, 100]);
  });

  test('reorderScheduledWorkoutExercisesが失敗した場合、Alertを表示し表示をドラッグ前の並びへ戻す', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100, { name: '種目100' }), makeExercise(101, { name: '種目101' })]);
    mockReorderScheduledWorkoutExercises.mockRejectedValueOnce(new Error('db error'));
    const root = render();
    const list = root.findByType(ReorderableList);

    await act(async () => {
      list.props.onReorder({ from: 0, to: 1 });
      await Promise.resolve().then(() => Promise.resolve());
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '並び順を変更できませんでした。');
    const rowsAfter = root.findByType(ReorderableList).props.data as ScheduledWorkoutExerciseDetail[];
    expect(rowsAfter.map((r) => r.scheduledWorkoutExerciseId)).toEqual([100, 101]);
  });

  describe('ドラッグハンドルのaccessibilityActions(スクリーンリーダー向けの上へ/下へ移動)', () => {
    test('先頭行にはmoveUpアクションが無く、moveDownのみ発火するとreorderScheduledWorkoutExercisesが呼ばれる', () => {
      mockUseScheduledWorkoutExercises.mockReturnValue([
        makeExercise(100, { name: '種目100' }),
        makeExercise(101, { name: '種目101' }),
        makeExercise(102, { name: '種目102' }),
      ]);
      const root = render();
      const handle = root.findByProps({ accessibilityLabel: '種目100をドラッグして並び替え' });

      expect(handle.props.accessibilityActions).toEqual([{ name: 'moveDown', label: '下へ移動' }]);

      act(() => {
        handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
      });

      expect(mockReorderScheduledWorkoutExercises).toHaveBeenCalledWith(5, [101, 100, 102]);
    });

    test('末尾行にはmoveDownアクションが無く、moveUpのみ発火するとreorderScheduledWorkoutExercisesが呼ばれる', () => {
      mockUseScheduledWorkoutExercises.mockReturnValue([
        makeExercise(100, { name: '種目100' }),
        makeExercise(101, { name: '種目101' }),
        makeExercise(102, { name: '種目102' }),
      ]);
      const root = render();
      const handle = root.findByProps({ accessibilityLabel: '種目102をドラッグして並び替え' });

      expect(handle.props.accessibilityActions).toEqual([{ name: 'moveUp', label: '上へ移動' }]);

      act(() => {
        handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
      });

      expect(mockReorderScheduledWorkoutExercises).toHaveBeenCalledWith(5, [100, 102, 101]);
    });

    test('要素が1件だけのときはmoveUp/moveDownどちらのアクションも提供されない', () => {
      mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100, { name: '種目100' })]);
      const root = render();
      const handle = root.findByProps({ accessibilityLabel: '種目100をドラッグして並び替え' });

      expect(handle.props.accessibilityActions).toEqual([]);
    });
  });

  test('セット数がmetaTextに反映される', () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      makeExercise(100, {
        name: '種目100',
        sets: [
          { id: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
          { id: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
        ],
      }),
    ]);
    const root = render();
    expect(root.findByProps({ children: '2セット' })).toBeDefined();
  });

  test('seed後にuseScheduledWorkoutExercisesが別の値を返しても、rowsは最初にseedした内容のまま変わらない（ドラッグ中の競合防止）', () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100, { name: '種目100' }), makeExercise(101, { name: '種目101' })]);
    const root = render();
    expect(
      (root.findByType(ReorderableList).props.data as ScheduledWorkoutExerciseDetail[]).map(
        (r) => r.scheduledWorkoutExerciseId,
      ),
    ).toEqual([100, 101]);

    mockUseScheduledWorkoutExercises.mockReturnValue([
      makeExercise(100, { name: '種目100' }),
      makeExercise(101, { name: '種目101' }),
      makeExercise(102, { name: '種目102' }),
    ]);
    act(() => {
      currentInstance!.update(React.createElement(ScheduleWorkoutExerciseReorderScreen));
    });

    const rowsAfter = root.findByType(ReorderableList).props.data as ScheduledWorkoutExerciseDetail[];
    expect(rowsAfter.map((r) => r.scheduledWorkoutExerciseId)).toEqual([100, 101]);
  });

  test('連続してドラッグした場合、古い操作の失敗による巻き戻しが新しい操作の結果を上書きしない', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([makeExercise(100), makeExercise(101), makeExercise(102)]);
    let rejectFirst!: (e: Error) => void;
    mockReorderScheduledWorkoutExercises.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectFirst = reject)),
    );
    mockReorderScheduledWorkoutExercises.mockResolvedValueOnce(undefined);
    const root = render();
    const list = root.findByType(ReorderableList);

    act(() => {
      list.props.onReorder({ from: 0, to: 2 });
    });
    act(() => {
      root.findByType(ReorderableList).props.onReorder({ from: 0, to: 1 });
    });

    await act(async () => {
      rejectFirst(new Error('stale failure'));
      await Promise.resolve().then(() => Promise.resolve());
    });

    const rowsAfter = root.findByType(ReorderableList).props.data as ScheduledWorkoutExerciseDetail[];
    expect(rowsAfter.map((r) => r.scheduledWorkoutExerciseId)).toEqual([102, 101, 100]);
  });

  test('種目が0件でもクラッシュせず表示・戻るができる', () => {
    const root = render();
    const backBtn = findButtonByLabel(root, '戻る')!;

    act(() => {
      backBtn.props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();
  });
});
