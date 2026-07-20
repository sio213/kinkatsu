const mockPush = jest.fn();
const mockBack = jest.fn();
const mockStartWorkoutSession = jest.fn();
const mockCreatePastWorkoutSession = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('@/lib/workout/session', () => ({
  startWorkoutSession: (...args: unknown[]) => mockStartWorkoutSession(...args),
  createPastWorkoutSession: (...args: unknown[]) => mockCreatePastWorkoutSession(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import StartChooserScreen from '@/app/workout/start-chooser';

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(StartChooserScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // pastDateKey無し = 今日の通常フロー（既存挙動）
  mockUseLocalSearchParams.mockReturnValue({});
});

test('4択のカードを全て表示する', () => {
  const root = render();
  expect(root.findByProps({ children: 'おすすめメニュー' })).toBeDefined();
  expect(root.findByProps({ children: '履歴から' })).toBeDefined();
  expect(root.findByProps({ children: '自分で選ぶ' })).toBeDefined();
  expect(root.findByProps({ children: 'ルーティン' })).toBeDefined();
});

test('未実装(おすすめメニュー・履歴から)はdisabledで「準備中」バッジを表示する', () => {
  const root = render();
  const badgeTexts = root.findAllByType(Text).filter((t) => t.props.children === '準備中');
  expect(badgeTexts.length).toBe(2);
  const recommend = findCardByLabel(root, 'おすすめメニュー')!;
  const history = findCardByLabel(root, '履歴から')!;
  expect(recommend.props.accessibilityState).toEqual({ disabled: true });
  expect(history.props.accessibilityState).toEqual({ disabled: true });
});

test('「自分で選ぶ」をタップすると空セッションを作成し、newSession=1付きで種目追加ピッカーへ直接遷移する（/workout/{id}は経由しない、2026-07-20）', async () => {
  mockStartWorkoutSession.mockResolvedValue({ id: 42 });
  const root = render();

  await act(async () => {
    findCardByLabel(root, '自分で選ぶ')!.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockStartWorkoutSession).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-picker',
    params: { sessionId: '42', newSession: '1' },
  });
});

test('「自分で選ぶ」が失敗したらAlertを表示し遷移しない', async () => {
  mockStartWorkoutSession.mockRejectedValue(new Error('fail'));
  const root = render();

  await act(async () => {
    findCardByLabel(root, '自分で選ぶ')!.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('「ルーティン」をタップするとルーティン一覧へ遷移する（セッション作成はしない）', () => {
  const root = render();

  act(() => {
    findCardByLabel(root, 'ルーティン')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine');
  expect(mockStartWorkoutSession).not.toHaveBeenCalled();
});

test('disabledなカードはonPressを持たない（タップしても何も起きない）', () => {
  const root = render();
  const recommend = findCardByLabel(root, 'おすすめメニュー')!;
  expect(recommend.props.onPress).toBeUndefined();
});

test('「自分で選ぶ」を連打してもstartWorkoutSessionは1回しか呼ばれない（useWorkoutStarterのisStartingRefによる二重生成防止）', async () => {
  let resolveStart!: (v: { id: number }) => void;
  mockStartWorkoutSession.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const root = render();
  const card = findCardByLabel(root, '自分で選ぶ')!;

  act(() => {
    card.props.onPress();
    card.props.onPress();
  });
  expect(mockStartWorkoutSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveStart({ id: 1 });
    await Promise.resolve();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

// カレンダー過去日パネル「記録を追加」から遷移してきた場合（2026-07-20）。pastDateKeyが
// 付いている間は、選んだ方法の結果が「トレーニング中」ではなく過去日の完了済みセッション
// （記録の編集モード）になる
describe('pastDateKeyモード（過去日の事後記録）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-07-25' });
  });

  test('タイトルに「どう記録する？」と対象日をサブタイトルで表示する（@user-advisor指摘: 日付取り違え防止）', () => {
    const root = render();
    expect(root.findByProps({ children: 'どう記録する？' })).toBeDefined();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  });

  test('「自分で選ぶ」をタップすると、選択日の正午時刻でcreatePastWorkoutSessionを呼び種目追加ピッカーへ直接遷移する', async () => {
    mockCreatePastWorkoutSession.mockResolvedValue({ id: 42 });
    const root = render();

    await act(async () => {
      findCardByLabel(root, '自分で選ぶ')!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStartWorkoutSession).not.toHaveBeenCalled();
    expect(mockCreatePastWorkoutSession).toHaveBeenCalledTimes(1);
    const calledWith = new Date(mockCreatePastWorkoutSession.mock.calls[0][0]);
    expect(calledWith.getFullYear()).toBe(2026);
    expect(calledWith.getMonth()).toBe(6);
    expect(calledWith.getDate()).toBe(25);
    expect(calledWith.getHours()).toBe(12);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/exercise-picker',
      params: { sessionId: '42', newSession: '1' },
    });
  });

  test('「ルーティン」をタップすると、pastDateKey付きで過去日専用のルーティンピッカーへ遷移する（フルCRUD一覧app/routine/index.tsxではなく、@designer指摘で専用ピッカーに変更、セッション作成はしない）', () => {
    const root = render();

    act(() => {
      findCardByLabel(root, 'ルーティン')!.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/past-routine-picker',
      params: { pastDateKey: '2026-07-25' },
    });
    expect(mockCreatePastWorkoutSession).not.toHaveBeenCalled();
  });

  test('不正なpastDateKeyの場合は日付が見つからない旨のエラー状態を表示する', () => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-13-99' });
    const root = render();
    expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  });
});
