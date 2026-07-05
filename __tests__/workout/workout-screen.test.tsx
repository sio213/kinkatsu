const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseWorkoutSession = jest.fn();
const mockEndWorkoutSession = jest.fn();
let mockSessionSets: unknown[] | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（タイマーチップ）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSession: (...args: unknown[]) => mockUseWorkoutSession(...args),
}));

jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
}));

jest.mock('@/db/client', () => ({
  db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn() }) }) },
}));

jest.mock('@/db/schema', () => ({ sets: { sessionId: 'sessionId' } }));

jest.mock('drizzle-orm', () => ({ eq: jest.fn((col, val) => ({ col, val })) }));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: mockSessionSets })),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import WorkoutScreen from '@/app/workout/[id]';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(WorkoutScreen));
  });
  return instance.root;
}

const activeSession = { id: 1, startedAt: Date.now(), endedAt: null };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockSessionSets = [];
  mockEndWorkoutSession.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

test('idが数値でない場合は「見つかりません」表示になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
});

test('セッションが見つからない場合、「戻る」を押すとrouter.backが呼ばれる', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: true });
  const root = render();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('セッションが見つかった場合、ネイティブヘッダーのタイマーを含む通常のトレーニング中画面を表示する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  // タイトル・戻るボタンはネイティブヘッダー（Stack.Screen options）が担うため、
  // ここではheaderRightに渡したタイマーが実際にレンダーされることだけを確認する
  expect(root.findByProps({ children: '0:00' })).toBeDefined();
  expect(findButtonByLabel(root, '種目を追加')).toBeDefined();
  expect(findButtonByLabel(root, 'トレーニングを終了')).toBeDefined();
});

test('セット0件で終了を押すと確認ダイアログが出て、確定するとendWorkoutSessionが呼ばれる', async () => {
  mockSessionSets = [];
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '終了する');
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'トレーニングを終了',
    'まだ種目を記録していません。終了しますか？',
    expect.anything(),
  );
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockBack).toHaveBeenCalled();
});

test('セット0件で終了確認をキャンセルするとendWorkoutSessionは呼ばれない', async () => {
  mockSessionSets = [];
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('セットが1件以上ある場合は確認ダイアログを出さず即座に終了する', async () => {
  mockSessionSets = [{ id: 1, sessionId: 1, weight: 60, reps: 10 }];
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockBack).toHaveBeenCalled();
});

test('endWorkoutSessionが失敗した場合はエラーAlertが表示され、router.backは呼ばれない', async () => {
  mockSessionSets = [{ id: 1, sessionId: 1, weight: 60, reps: 10 }];
  mockEndWorkoutSession.mockRejectedValueOnce(new Error('fail'));
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを終了できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('種目を追加ボタンは押しても何も起きない（T3で配線予定）', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  const addBtn = findButtonByLabel(root, '種目を追加')!;
  expect(() => {
    act(() => {
      addBtn.props.onPress();
    });
  }).not.toThrow();
  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});
