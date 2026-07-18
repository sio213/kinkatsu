const mockPush = jest.fn();
const mockStartWorkoutSession = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('@/lib/workout/session', () => ({
  startWorkoutSession: (...args: unknown[]) => mockStartWorkoutSession(...args),
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

test('「自分で選ぶ」をタップすると空セッションを作成しワークアウト画面へ遷移する', async () => {
  mockStartWorkoutSession.mockResolvedValue({ id: 42 });
  const root = render();

  await act(async () => {
    findCardByLabel(root, '自分で選ぶ')!.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockStartWorkoutSession).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/42');
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
