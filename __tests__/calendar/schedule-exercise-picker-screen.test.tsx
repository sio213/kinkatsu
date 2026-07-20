const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
  Stack: {
    Screen: ({ options }: { options?: { title?: string; headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
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

import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import ScheduleExercisePickerScreen from '@/app/calendar/schedule-exercise-picker';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

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

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleExercisePickerScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25' });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
  useExerciseSortStore.setState({ listSortBy: 'category', pickerSortBy: 'frequent' });
});

test('1件選択して確定すると、dateKey・選択したexerciseIds付きでschedule-time-pickerへ遷移する', () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-time-picker',
    params: { dateKey: '2026-07-25', exerciseIds: '10' },
  });
});

test('複数選択すると、選択順を保ったままカンマ区切りでexerciseIdsに渡る', () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: squatLabel }).props.onPress();
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '2件を追加')!;
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-time-picker',
    params: { dateKey: '2026-07-25', exerciseIds: '11,10' },
  });
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

test('ヘッダーに「種目を選択」タイトルと対象日をサブタイトルで表示する（@designer指摘: 前画面で選んだ日付を種目選択中に見失わないように、2026-07-20）', () => {
  const root = render();
  expect(root.findByProps({ children: '種目を選択' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('不正なdateKeyの場合は日付が見つからない旨のエラー状態を表示し、種目一覧は表示しない', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-13-99' });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  expect(root.findAllByProps({ accessibilityLabel: benchPressLabel })).toHaveLength(0);
});
