const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseRoutineDiff = jest.fn();
const mockGetRoutineDetail = jest.fn();
const mockUpdateRoutine = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: { Screen: () => null },
}));

jest.mock('@/hooks/use-routine-diff', () => ({
  useRoutineDiff: (...args: unknown[]) => mockUseRoutineDiff(...args),
}));

// 差分の計算は__tests__/routines/diff.test.tsの担当。ここでは画面の選択状態と
// 「チェック済みだけを反映してupdateRoutineを呼ぶ」ところを見る
jest.mock('@/lib/routines/db', () => ({
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
  updateRoutine: (...args: unknown[]) => mockUpdateRoutine(...args),
}));

// サムネイル解決がassetsのrequireまで辿るのを避ける
jest.mock('@/lib/exercises/images', () => ({ getExerciseImages: () => ({ thumbnail: null, video: null }) }));

import RoutineUpdateScreen from '@/app/routine/update/[id]';
import { buildRoutineDiff } from '@/lib/routines/diff';
import { useRoutineUpdatePromptStore } from '@/lib/workout/routine-update-prompt-store';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function set(weight: number | null, reps: number | null) {
  return { weight, reps, durationSeconds: null, distanceMeters: null };
}

const meta = { category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: null };
const routineExercises = [
  { id: 1, exerciseId: 10, name: 'ベンチプレス', ...meta, sets: [set(95, 5), set(95, 5)] },
  { id: 2, exerciseId: 20, name: 'ペックフライ', ...meta, sets: [set(30, 12)] },
];
const sessionCards = [
  { workoutSessionExerciseId: 100, exerciseId: 10, name: 'ベンチプレス', ...meta, sets: [set(100, 5), set(100, 5), set(90, 8)] },
  { workoutSessionExerciseId: 101, exerciseId: 30, name: 'ディップス', ...meta, sets: [set(null, 12)] },
];
const diff = buildRoutineDiff(routineExercises, sessionCards);

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineUpdateScreen));
  });
  return currentInstance!.root;
}

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter((s) => s.length > 0);
}

function pressByLabel(root: ReactTestInstance, label: string) {
  const target = root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label);
  if (!target) throw new Error(`not found: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

function checkboxState(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label)?.props
    .accessibilityState;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineUpdatePromptStore.setState({ dismissed: false, hydrated: true });
  mockUseLocalSearchParams.mockReturnValue({ id: '7', sessionId: '1' });
  mockUseRoutineDiff.mockReturnValue({ diff, routineName: '胸の日', retry: jest.fn() });
  mockGetRoutineDetail.mockResolvedValue({ routine: { id: 7, name: '胸の日' }, exercises: routineExercises, reminder: null });
  mockUpdateRoutine.mockResolvedValue(undefined);
});

test('3つのセクションを差分の件数つきで並べる', () => {
  const root = render();

  expect(texts(root)).toEqual(
    expect.arrayContaining(['追加した種目', '値の変更', '未実施の種目（チェックで削除）', '1件']),
  );
});

// 未実施だけ既定オフ。その日やらなかっただけの種目を型から消すのは、多くの場合やってほしくない
test('既定チェックは追加＝ON・値の変更＝ON・未実施＝OFF', () => {
  const root = render();

  // 件数の数字だけ入れ子のTextで強調しているため、2要素に分かれて拾われる
  expect(texts(root)).toEqual(expect.arrayContaining(['2', '/3種目を選択中']));
  expect(checkboxState(root, 'ディップス、胸、自重×12を追加')?.checked).toBe(true);
  expect(checkboxState(root, 'ペックフライ、胸、30kg×12を削除')?.checked).toBe(false);
});

test('「値の変更」の行はルーティンと今日の要約を両方出す', () => {
  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['ルーティン', '2セット・95kg×5', '今日', '3セット・100kg×5']));
});

// デザイン案の「外すと要約が戻るので影響がその場で分かります」
test('セットのチェックを外すと親の「今日」の要約がその場で戻る', () => {
  const root = render();
  pressByLabel(root, 'セットの内訳を開く');

  expect(texts(root)).toEqual(expect.arrayContaining(['3セット・100kg×5']));

  // 3セット目（追加）のチェックを外すと2セットに戻る
  pressByLabel(root, '3セット目 90kg×8 を追加');

  expect(texts(root)).toEqual(expect.arrayContaining(['2セット・100kg×5']));
});

test('アコーディオンは「値の変更」だけが持つ', () => {
  const root = render();

  const chevrons = root
    .findAllByType(TouchableOpacity)
    .filter((b) => b.props.accessibilityLabel === 'セットの内訳を開く');
  expect(chevrons).toHaveLength(1);
});

test('チェックを全部外すと更新ボタンが無効になる', () => {
  const root = render();
  // 既定は3件中2件選択なので、1回目の全選択で3件になり、2回目で0件になる
  pressByLabel(root, '全選択');
  pressByLabel(root, '全選択');

  const submit = root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === '更新する');
  expect(submit?.props.accessibilityState?.disabled).toBe(true);
});

test('更新するとチェック済みの差分だけがupdateRoutineに渡り、画面を閉じる', async () => {
  const root = render();

  await act(async () => {
    root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === '更新する')!
      .props.onPress();
  });

  expect(mockUpdateRoutine).toHaveBeenCalledWith(7, {
    name: '胸の日',
    exercises: [
      // 値の変更（チェック済み）
      { exerciseId: 10, sets: [set(100, 5), set(100, 5), set(90, 8)] },
      // 未実施は既定オフなので残る
      { exerciseId: 20, sets: [set(30, 12)] },
      // 追加した種目は末尾
      { exerciseId: 30, sets: [set(null, 12)] },
    ],
  });
  expect(mockBack).toHaveBeenCalled();
});

// 「今後表示しない」は「同期しない」という表明。後から実際に更新したなら撤回したと読む
test('更新が成功すると「今後表示しない」を解除する', async () => {
  useRoutineUpdatePromptStore.setState({ dismissed: true, hydrated: true });
  const root = render();

  await act(async () => {
    root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === '更新する')!
      .props.onPress();
  });

  expect(useRoutineUpdatePromptStore.getState().dismissed).toBe(false);
});

test('更新に失敗したらAlertを出し、画面は閉じない', async () => {
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUpdateRoutine.mockRejectedValue(new Error('boom'));
  const root = render();

  await act(async () => {
    root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === '更新する')!
      .props.onPress();
  });

  expect(alert).toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('差分ゼロなら空状態を出し、更新ボタンは置かない', () => {
  mockUseRoutineDiff.mockReturnValue({
    diff: { added: [], changed: [], removed: [] },
    routineName: '胸の日',
    retry: jest.fn(),
  });

  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['ルーティン通りでした。更新するものはありません']));
  expect(root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === '更新する')).toBeUndefined();
});

test('取得に失敗したら再試行を出す', () => {
  mockUseRoutineDiff.mockReturnValue({ diff: 'error', routineName: null, retry: jest.fn() });

  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['差分を読み込めませんでした', '再試行']));
});
