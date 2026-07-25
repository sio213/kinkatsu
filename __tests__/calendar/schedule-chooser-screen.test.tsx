const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
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
import { TouchableOpacity } from 'react-native';
import ScheduleChooserScreen from '@/app/calendar/schedule-chooser';

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleChooserScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25' });
});

// 2026-07-25、@ユーザー指示: トレーニング開始選択画面のデザイン確定に合わせて縦リストへ変更し、
// 未実装のプレースホルダー（おすすめメニュー・履歴から）を廃止した
test('3択を説明文つきで表示する', () => {
  const root = render();
  expect(root.findByProps({ children: '種目を追加' })).toBeDefined();
  expect(root.findByProps({ children: '好きな種目を選んで予定を作る' })).toBeDefined();
  expect(root.findByProps({ children: 'ルーティン' })).toBeDefined();
  expect(root.findByProps({ children: '登録したメニューから予定を作る' })).toBeDefined();
  expect(root.findByProps({ children: '過去の記録' })).toBeDefined();
  expect(root.findByProps({ children: '過去の履歴と同じ内容で予定を作る' })).toBeDefined();
});

// 2026-07-25、@ユーザー指示: 開始選択画面と同じ3択に揃えた。既存予定の⋮「過去の記録から
// 読み込み」と同じ画面へ、scheduledWorkoutIdの代わりにdateKeyを渡して開く
test('「過去の記録」をタップするとdateKey付きでschedule-workout-history-pickerへ遷移する（DBには触れない）', () => {
  const root = render();
  act(() => {
    findCardByLabel(root, '過去の記録')!.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-workout-history-picker',
    params: { dateKey: '2026-07-25' },
  });
});

test('未実装のプレースホルダー（おすすめメニュー・履歴から）は表示しない', () => {
  const root = render();
  expect(() => root.findByProps({ children: 'おすすめメニュー' })).toThrow();
  expect(() => root.findByProps({ children: '履歴から' })).toThrow();
  expect(() => root.findByProps({ children: '準備中' })).toThrow();
});

test('タイトル「予定を追加」と対象日をサブタイトルで表示する', () => {
  const root = render();
  expect(root.findByProps({ children: '予定を追加' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('「種目を追加」をタップするとdateKey付きでschedule-exercise-pickerへ遷移する（DBには触れない）', () => {
  const root = render();
  act(() => {
    findCardByLabel(root, '種目を追加')!.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-exercise-picker',
    params: { dateKey: '2026-07-25' },
  });
});

test('「ルーティン」をタップするとdateKey付きでschedule-routine-pickerへ遷移する', () => {
  const root = render();
  act(() => {
    findCardByLabel(root, 'ルーティン')!.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-routine-picker',
    params: { dateKey: '2026-07-25' },
  });
});

test('各行のVoiceOverヒントに対象日を補う', () => {
  const root = render();
  expect(findCardByLabel(root, '種目を追加')!.props.accessibilityHint).toBe(
    '好きな種目を選んで予定を作る。7月25日（土）の予定として種目を選びます',
  );
});

test('不正なdateKeyの場合は日付が見つからない旨のエラー状態を表示する', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-13-99' });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
});
