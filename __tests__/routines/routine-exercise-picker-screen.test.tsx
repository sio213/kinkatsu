const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseExercises = jest.fn();
const mockBuildInitialRoutineSets = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/hooks/use-exercise-usage-stats', () => ({
  useExerciseUsageStats: () => new Map(),
}));

jest.mock('@/lib/routines/db', () => ({
  buildInitialRoutineSets: (...args: unknown[]) => mockBuildInitialRoutineSets(...args),
}));

import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import RoutineExercisePickerScreen from '@/app/routine/exercise-picker';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';

const benchPress = { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: 'bench_press', favorite: false };
const squat = { id: 11, name: 'スクワット', category: 'leg', measurementType: 'weight_reps', source: 'preset', slug: 'squat', favorite: false };
const benchPressLabel = 'ベンチプレス、胸';
const squatLabel = 'スクワット、脚';

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
    currentInstance = create(React.createElement(RoutineExercisePickerScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
  mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
  mockBuildInitialRoutineSets.mockResolvedValue([{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useExerciseSortStore.setState({ listSortBy: 'category', pickerSortBy: 'frequent' });
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('1件選択して確定すると、buildInitialRoutineSetsが呼ばれドラフトストアに追加されrouter.backする', async () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(mockBuildInitialRoutineSets).toHaveBeenCalledWith(10);
  expect(useRoutineDraftStore.getState().exercises).toEqual([
    {
      exerciseId: 10,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench_press',
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    },
  ]);
  expect(mockBack).toHaveBeenCalled();
});

test('複数選択すると、選択順を保ったままドラフトストアに追加される', async () => {
  mockBuildInitialRoutineSets.mockImplementation((id: number) =>
    Promise.resolve([{ weight: id, reps: 1, durationSeconds: null, distanceMeters: null }]),
  );
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: squatLabel }).props.onPress();
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '2件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([11, 10]);
});

test('選択idがexercises一覧に存在しない場合、その種目だけスキップされ残りは正常に追加される', async () => {
  // 選択直後にDBから削除された等、存在しないidが紛れ込むケースを想定
  mockUseExercises.mockReturnValue({ exercises: [benchPress] });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(useRoutineDraftStore.getState().exercises).toHaveLength(1);
  expect(useRoutineDraftStore.getState().exercises[0].exerciseId).toBe(10);
});

test('buildInitialRoutineSetsが失敗するとAlertが表示され、ドラフトストアには何も追加されない', async () => {
  mockBuildInitialRoutineSets.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
  expect(useRoutineDraftStore.getState().exercises).toEqual([]);
  expect(mockBack).not.toHaveBeenCalled();
});

test('確定ボタンを連打してもbuildInitialRoutineSetsは選択数分しか呼ばれない', async () => {
  let resolveSets!: () => void;
  mockBuildInitialRoutineSets.mockReturnValue(
    new Promise((resolve) => {
      resolveSets = () => resolve([{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }]);
    }),
  );
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  act(() => {
    addBtn.props.onPress();
    addBtn.props.onPress();
  });

  expect(mockBuildInitialRoutineSets).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveSets();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('ⓘボタンを押すと種目詳細へ遷移する', () => {
  const root = render();
  const infoButtons = root
    .findAllByType(TouchableOpacity)
    .filter((btn: ReactTestInstance) => btn.props.accessibilityLabel === 'ベンチプレスの詳細を見る');
  expect(infoButtons.length).toBe(1);

  act(() => {
    infoButtons[0].props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/10');
});
