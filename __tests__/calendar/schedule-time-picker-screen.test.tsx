const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockAddScheduledWorkout = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/lib/calendar/scheduled-workouts', () => ({
  addScheduledWorkout: (...args: unknown[]) => mockAddScheduledWorkout(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ScheduleTimePickerScreen from '@/app/calendar/schedule-time-picker';

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleTimePickerScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: '10', routineName: '胸の日' });
  mockAddScheduledWorkout.mockResolvedValue(1);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('ヘッダーに選択日をタイトル、ルーティン名をサブタイトルとして表示する', () => {
  const root = render();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  expect(root.findByProps({ children: '胸の日' })).toBeDefined();
});

test('デフォルト時刻は18:00（iOSは常時インラインspinnerのDateTimePickerの初期値で確認する）', () => {
  const root = render();
  const picker = root.findByType(DateTimePicker);
  const value: Date = picker.props.value;
  expect(value.getHours()).toBe(18);
  expect(value.getMinutes()).toBe(0);
});

test('確定を押すとaddScheduledWorkoutにroutineId/dateKey/hour/minuteを渡し、成功後router.dismiss(2)する', async () => {
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockAddScheduledWorkout).toHaveBeenCalledWith(10, '2026-07-25', 18, 0);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
  mockAddScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を追加できませんでした。');
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('連打してもaddScheduledWorkoutは1回しか呼ばれない（isSubmittingRefによる二重送信防止）', async () => {
  let resolveAdd!: (v: number) => void;
  mockAddScheduledWorkout.mockReturnValue(
    new Promise((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  act(() => {
    submitBtn.props.onPress();
    submitBtn.props.onPress();
  });
  expect(mockAddScheduledWorkout).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd(1);
  });
});

test('失敗後はisSubmittingRefが解除され、再度確定を押すと再度呼べる', async () => {
  mockAddScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  mockAddScheduledWorkout.mockResolvedValueOnce(2);
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockAddScheduledWorkout).toHaveBeenCalledTimes(2);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('routineIdが不正(NaN)な場合は「見つかりません」画面になり、addScheduledWorkoutは呼ばれない', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: 'abc', routineName: '胸の日' });
  const root = render();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  expect(() => findByLabel(root, 'この時刻で追加')).not.toThrow();
  expect(findByLabel(root, 'この時刻で追加')).toBeUndefined();
});

test('「見つかりません」画面の「戻る」を押すとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: 'abc', routineName: '胸の日' });
  const root = render();
  const backBtn = findByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});
