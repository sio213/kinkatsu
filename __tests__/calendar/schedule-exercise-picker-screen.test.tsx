const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockUpdateScheduledWorkoutExercises = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('@/lib/calendar/scheduled-workouts', () => ({
  updateScheduledWorkoutExercises: (...args: unknown[]) => mockUpdateScheduledWorkoutExercises(...args),
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

// scheduledWorkoutId+exerciseIds付きで開かれた場合は編集モード（DirectScheduleExerciseGroupの
// 種目カードタップからの遷移先、2026-07-20）。既存の選択済みexerciseIdsは呼び出し元
// (calendar.tsx)が手元の値をそのままルートパラメータとして渡す設計のため、この画面自身は
// DBを引き直さない（@tester指摘: 引き直す設計だと読み込み中/削除済みを区別できない問題があった）。
// 新規作成と違いschedule-time-pickerを経由せず、その場でupdateScheduledWorkoutExercisesを
// 呼んで前の画面へ戻る
describe('編集モード（scheduledWorkoutId+exerciseIds付き、2026-07-20）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', scheduledWorkoutId: '5', exerciseIds: '10' });
  });

  test('既存の種目が選択済み状態で表示される', () => {
    const root = render();
    const benchRow = root.findByProps({ accessibilityLabel: benchPressLabel });
    expect(benchRow.props.accessibilityState).toEqual({ checked: true });
    const squatRow = root.findByProps({ accessibilityLabel: squatLabel });
    expect(squatRow.props.accessibilityState).toEqual({ checked: false });
  });

  test('ヘッダーは「種目を編集」タイトルになる', () => {
    const root = render();
    expect(root.findByProps({ children: '種目を編集' })).toBeDefined();
  });

  test('選択を変更して確定すると、schedule-time-pickerへは遷移せずupdateScheduledWorkoutExercisesを呼んで前の画面へ戻る', async () => {
    mockUpdateScheduledWorkoutExercises.mockResolvedValue(undefined);
    const root = render();

    act(() => {
      root.findByProps({ accessibilityLabel: squatLabel }).props.onPress();
    });
    const saveBtn = findButtonByLabel(root, '2件で保存')!;
    await act(async () => {
      await saveBtn.props.onPress();
    });

    expect(mockUpdateScheduledWorkoutExercises).toHaveBeenCalledWith(5, [10, 11]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('更新に失敗した場合はエラーAlertを表示し、前の画面へ戻らない', async () => {
    mockUpdateScheduledWorkoutExercises.mockRejectedValue(new Error('fail'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const root = render();

    const saveBtn = findButtonByLabel(root, '1件で保存')!;
    await act(async () => {
      await saveBtn.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目の更新に失敗しました。');
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('scheduledWorkoutIdはあるがexerciseIdsが無い/不正（削除済み予定・不正な直リンク等）の場合、永続的な空白ではなく「予定が見つかりません」を表示する', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', scheduledWorkoutId: '5' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
    expect(root.findAllByProps({ accessibilityLabel: benchPressLabel })).toHaveLength(0);
  });

  test('scheduledWorkoutIdが数値でない不正な直リンクの場合、新規作成モード扱いにはせず種目未選択の新規モードになる', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', scheduledWorkoutId: 'abc' });
    const root = render();
    // 編集モードではなく新規作成モードとして扱われるため、既存選択済み表示は無い
    const benchRow = root.findByProps({ accessibilityLabel: benchPressLabel });
    expect(benchRow.props.accessibilityState).toEqual({ checked: false });
  });
});
