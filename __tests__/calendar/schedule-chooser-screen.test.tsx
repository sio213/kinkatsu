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
import { Text, TouchableOpacity } from 'react-native';
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

test('4択のカードを全て表示する', () => {
  const root = render();
  expect(root.findByProps({ children: 'おすすめメニュー' })).toBeDefined();
  expect(root.findByProps({ children: '履歴から' })).toBeDefined();
  expect(root.findByProps({ children: '直接追加' })).toBeDefined();
  expect(root.findByProps({ children: 'ルーティン' })).toBeDefined();
});

test('未実装(おすすめメニュー・履歴から)はdisabledで「準備中」バッジを表示する', () => {
  const root = render();
  const badgeTexts = root.findAllByType(Text).filter((t) => t.props.children === '準備中');
  expect(badgeTexts.length).toBe(2);
  expect(findCardByLabel(root, 'おすすめメニュー')!.props.accessibilityState).toEqual({ disabled: true });
  expect(findCardByLabel(root, '履歴から')!.props.accessibilityState).toEqual({ disabled: true });
});

test('タイトル「どう予定する？」と対象日をサブタイトルで表示する', () => {
  const root = render();
  expect(root.findByProps({ children: 'どう予定する？' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('「直接追加」をタップするとdateKey付きでschedule-exercise-pickerへ遷移する（DBには触れない）', () => {
  const root = render();
  act(() => {
    findCardByLabel(root, '直接追加')!.props.onPress();
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

test('disabledなカードはonPressを持たない（タップしても何も起きない）', () => {
  const root = render();
  expect(findCardByLabel(root, 'おすすめメニュー')!.props.onPress).toBeUndefined();
});

test('不正なdateKeyの場合は日付が見つからない旨のエラー状態を表示する', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-13-99' });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
});
