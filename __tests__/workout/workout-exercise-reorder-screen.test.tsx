const mockBack = jest.fn();
const mockUseSessionExercises = jest.fn();
const mockUseSessionSets = jest.fn();
const mockReorderSessionExercises = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ sessionId: '1' }),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useSessionExercises: (...args: unknown[]) => mockUseSessionExercises(...args),
  useSessionSets: (...args: unknown[]) => mockUseSessionSets(...args),
}));

jest.mock('@/lib/workout/session', () => ({
  reorderSessionExercises: (...args: unknown[]) => mockReorderSessionExercises(...args),
}));

import WorkoutExerciseReorderScreen from '@/app/workout/exercise-reorder';
import type { SessionExercise } from '@/hooks/use-workout-session';
import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import ReorderableList from 'react-native-reorderable-list';

function makeExercise(sessionExerciseId: number, overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: sessionExerciseId,
    name: `種目${sessionExerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    favorite: false,
    formPoints: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    orderIndex: 0,
    sessionExerciseId,
    ...overrides,
  } as SessionExercise;
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
    currentInstance = create(React.createElement(WorkoutExerciseReorderScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSessionExercises.mockReturnValue([]);
  mockUseSessionSets.mockReturnValue(new Map());
  mockReorderSessionExercises.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('セッションの全種目分の行が表示される', () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { name: '種目10', orderIndex: 0 }),
    makeExercise(11, { name: '種目11', orderIndex: 1 }),
  ]);
  const root = render();

  expect(root.findByProps({ children: '種目10' })).toBeDefined();
  expect(root.findByProps({ children: '種目11' })).toBeDefined();
});

test('戻るを押すとrouter.backが呼ばれる', () => {
  mockUseSessionExercises.mockReturnValue([makeExercise(10)]);
  const root = render();
  const backBtn = findButtonByLabel(root, '戻る')!;

  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('ドラッグで並び替えると、sessionIdと新しい順序でreorderSessionExercisesが呼ばれる(先頭→末尾)', () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { orderIndex: 0 }),
    makeExercise(11, { orderIndex: 1 }),
    makeExercise(12, { orderIndex: 2 }),
  ]);
  const root = render();
  const list = root.findByType(ReorderableList);

  act(() => {
    list.props.onReorder({ from: 0, to: 2 });
  });

  expect(mockReorderSessionExercises).toHaveBeenCalledWith(1, [11, 12, 10]);
});

test('reorderSessionExercisesが失敗した場合、Alertを表示し表示をドラッグ前の並びへ戻す', async () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { name: '種目10', orderIndex: 0 }),
    makeExercise(11, { name: '種目11', orderIndex: 1 }),
  ]);
  mockReorderSessionExercises.mockRejectedValueOnce(new Error('db error'));
  const root = render();
  const list = root.findByType(ReorderableList);

  await act(async () => {
    list.props.onReorder({ from: 0, to: 1 });
    // persist()内のPromiseチェーン(catch節のsetRows)が解決するまで待つ
    await Promise.resolve().then(() => Promise.resolve());
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を並び替えられませんでした。');
  const rowsAfter = root.findByType(ReorderableList).props.data as SessionExercise[];
  expect(rowsAfter.map((r) => r.sessionExerciseId)).toEqual([10, 11]);
});

describe('ドラッグハンドルのaccessibilityActions(スクリーンリーダー向けの上へ/下へ移動)', () => {
  test('先頭行にはmoveUpアクションが無く、moveDownのみ発火するとreorderSessionExercisesが呼ばれる', () => {
    mockUseSessionExercises.mockReturnValue([
      makeExercise(10, { name: '種目10', orderIndex: 0 }),
      makeExercise(11, { name: '種目11', orderIndex: 1 }),
      makeExercise(12, { name: '種目12', orderIndex: 2 }),
    ]);
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目10をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([{ name: 'moveDown', label: '下へ移動' }]);

    act(() => {
      handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
    });

    expect(mockReorderSessionExercises).toHaveBeenCalledWith(1, [11, 10, 12]);
  });

  test('末尾行にはmoveDownアクションが無く、moveUpのみ発火するとreorderSessionExercisesが呼ばれる', () => {
    mockUseSessionExercises.mockReturnValue([
      makeExercise(10, { name: '種目10', orderIndex: 0 }),
      makeExercise(11, { name: '種目11', orderIndex: 1 }),
      makeExercise(12, { name: '種目12', orderIndex: 2 }),
    ]);
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目12をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([{ name: 'moveUp', label: '上へ移動' }]);

    act(() => {
      handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
    });

    expect(mockReorderSessionExercises).toHaveBeenCalledWith(1, [10, 12, 11]);
  });

  test('中間行はmoveUp/moveDown両方のアクションを持つ', () => {
    mockUseSessionExercises.mockReturnValue([
      makeExercise(10, { orderIndex: 0 }),
      makeExercise(11, { name: '種目11', orderIndex: 1 }),
      makeExercise(12, { orderIndex: 2 }),
    ]);
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目11をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([
      { name: 'moveUp', label: '上へ移動' },
      { name: 'moveDown', label: '下へ移動' },
    ]);
  });

  test('要素が1件だけのときはmoveUp/moveDownどちらのアクションも提供されない', () => {
    mockUseSessionExercises.mockReturnValue([makeExercise(10, { name: '種目10' })]);
    const root = render();
    const handle = root.findByProps({ accessibilityLabel: '種目10をドラッグして並び替え' });

    expect(handle.props.accessibilityActions).toEqual([]);
  });
});

test('同一種目(同じexerciseId)を2回セッションに追加していても、sessionExerciseId基準で正しく並び替わる', () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { id: 5, name: 'ベンチプレス', orderIndex: 0 }),
    makeExercise(11, { id: 7, name: 'スクワット', orderIndex: 1 }),
    makeExercise(12, { id: 5, name: 'ベンチプレス', orderIndex: 2 }),
  ]);
  const root = render();
  const list = root.findByType(ReorderableList);

  act(() => {
    list.props.onReorder({ from: 0, to: 2 });
  });

  expect(mockReorderSessionExercises).toHaveBeenCalledWith(1, [11, 12, 10]);
});

test('sessionSetsが後から解決しても、セット数表示が0に固定されず正しく反映される(setCountのライブ参照を検証)', () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { name: '種目10', orderIndex: 0 }),
    makeExercise(11, { name: '種目11', orderIndex: 1 }),
  ]);
  // sessionExercisesが先に解決し、sessionSetsがまだ空Mapのまま(未解決)の状態でseedされる
  mockUseSessionSets.mockReturnValue(new Map());
  const root = render();

  expect(() => root.findByProps({ children: '2セット' })).toThrow();

  // sessionSetsのlive queryが後から解決した想定で再レンダー
  mockUseSessionSets.mockReturnValue(new Map([[10, [{ id: 1 }, { id: 2 }]]]));
  act(() => {
    currentInstance!.update(React.createElement(WorkoutExerciseReorderScreen));
  });

  expect(root.findByProps({ children: '2セット' })).toBeDefined();
});

test('seed後にuseSessionExercisesが別の値を返しても、rowsは最初にseedした内容のまま変わらない', () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { name: '種目10', orderIndex: 0 }),
    makeExercise(11, { name: '種目11', orderIndex: 1 }),
  ]);
  const root = render();
  expect((root.findByType(ReorderableList).props.data as SessionExercise[]).map((r) => r.sessionExerciseId)).toEqual([
    10, 11,
  ]);

  // 他画面での同時編集を模して、live queryの戻り値を変える(種目12が追加された想定)
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { name: '種目10', orderIndex: 0 }),
    makeExercise(11, { name: '種目11', orderIndex: 1 }),
    makeExercise(12, { name: '種目12', orderIndex: 2 }),
  ]);
  act(() => {
    currentInstance!.update(React.createElement(WorkoutExerciseReorderScreen));
  });

  const rowsAfter = root.findByType(ReorderableList).props.data as SessionExercise[];
  expect(rowsAfter.map((r) => r.sessionExerciseId)).toEqual([10, 11]);
});

test('連続してドラッグした場合、古い操作の失敗による巻き戻しが新しい操作の結果を上書きしない', async () => {
  mockUseSessionExercises.mockReturnValue([
    makeExercise(10, { orderIndex: 0 }),
    makeExercise(11, { orderIndex: 1 }),
    makeExercise(12, { orderIndex: 2 }),
  ]);
  let rejectFirst!: (e: Error) => void;
  mockReorderSessionExercises.mockImplementationOnce(
    () => new Promise((_resolve, reject) => (rejectFirst = reject)),
  );
  mockReorderSessionExercises.mockResolvedValueOnce(undefined);
  const root = render();
  const list = root.findByType(ReorderableList);

  // 1回目のドラッグ(未解決のまま保留)→2回目のドラッグ(こちらは成功)の順に発火させる
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

  // 1回目(既に古い操作)の失敗による巻き戻しは無視され、2回目の結果が保たれる
  const rowsAfter = root.findByType(ReorderableList).props.data as SessionExercise[];
  expect(rowsAfter.map((r) => r.sessionExerciseId)).toEqual([12, 11, 10]);
});

test('sessionExercisesが0件でもクラッシュせず表示・戻るができる', () => {
  const root = render();
  const backBtn = findButtonByLabel(root, '戻る')!;

  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});
