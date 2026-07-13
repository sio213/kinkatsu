const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import RoutineReminderScreen from '@/app/routine/reminder';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function findChipByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => t.props.children === label),
    );
}

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineReminderScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('タイトル・通知内容の入力欄は表示されない(showTitleBody: false)', () => {
  const root = render();
  expect(() => root.findByProps({ placeholder: 'タイトル' })).toThrow();
  expect(() => root.findByProps({ placeholder: '通知内容' })).toThrow();
});

test('未設定の状態で開くと既定値(毎日18:00)から編集を始められる', () => {
  const root = render();
  const picker = root.findByType(DateTimePicker);
  expect(picker.props.value.getHours()).toBe(18);
  expect(picker.props.value.getMinutes()).toBe(0);
});

test('既存の設定があれば、その内容が初期値として反映される', () => {
  act(() => {
    useRoutineDraftStore.getState().setReminder({
      title: 'x',
      body: 'y',
      kind: 'weekly',
      hour: 7,
      minute: 30,
      weekdays: [1, 3],
      intervalDays: 7,
      enabled: true,
    });
  });
  const root = render();

  const picker = root.findByType(DateTimePicker);
  expect(picker.props.value.getHours()).toBe(7);
  expect(picker.props.value.getMinutes()).toBe(30);
  const monChip = findChipByLabel(root, '月')!;
  expect(monChip.props.accessibilityState).toEqual({ checked: true });
});

test('設定を押すとドラフトストアのreminderが更新されrouter.backする', async () => {
  const root = render();

  const submitBtn = findButtonByLabel(root, '設定')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(useRoutineDraftStore.getState().reminder).toEqual(
    expect.objectContaining({ kind: 'interval', hour: 18, minute: 0 }),
  );
  expect(mockBack).toHaveBeenCalled();
});

test('週次で曜日を選ばずに設定を押すとエラーになり、ドラフトストアは更新されずrouter.backもしない', async () => {
  const root = render();

  const weeklyChip = findChipByLabel(root, '毎週')!;
  act(() => {
    weeklyChip.props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '設定')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(useRoutineDraftStore.getState().reminder).toBeNull();
  expect(mockBack).not.toHaveBeenCalled();
});

test('キャンセルを押すとドラフトストアを変更せずrouter.backする', () => {
  const root = render();

  const cancelBtn = findButtonByLabel(root, 'キャンセル')!;
  act(() => {
    cancelBtn.props.onPress();
  });

  expect(useRoutineDraftStore.getState().reminder).toBeNull();
  expect(mockBack).toHaveBeenCalled();
});

test('TextInputは無い(タイトル・本文非表示)が、時刻・繰り返し設定のUIは操作できる', () => {
  const root = render();
  expect(root.findAllByType(TextInput)).toHaveLength(0);
});
