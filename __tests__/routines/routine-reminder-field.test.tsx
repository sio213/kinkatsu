import { RoutineReminderField } from '@/components/routines/routine-reminder-field';
import type { ReminderInput } from '@/lib/notifications/types';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function makeReminder(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'interval',
    hour: 18,
    minute: 0,
    intervalDays: 1,
    enabled: true,
    ...overrides,
  };
}

let currentInstance: ReturnType<typeof create> | undefined;

function render(props: Partial<Parameters<typeof RoutineReminderField>[0]> = {}) {
  const merged: Parameters<typeof RoutineReminderField>[0] = {
    enabled: true,
    onToggleEnabled: jest.fn(),
    reminder: null,
    onPressConfigure: jest.fn(),
    permState: 'granted',
    onRequestPermission: jest.fn(),
    now: new Date('2026-01-05T10:00:00'),
    ...props,
  };
  act(() => {
    currentInstance = create(<RoutineReminderField {...merged} />);
  });
  return currentInstance!.root;
}

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('ON+未設定は「リマインダーを設定」の促し行を表示する', () => {
  const root = render({ enabled: true, reminder: null });
  expect(findByLabel(root, 'リマインダーを設定')).toBeDefined();
});

test('OFF+未設定は促し行も設定内容も何も表示しない', () => {
  const root = render({ enabled: false, reminder: null });
  expect(findByLabel(root, 'リマインダーを設定')).toBeUndefined();
  expect(findByLabel(root, 'リマインダーの設定を変更')).toBeUndefined();
});

test('ON+設定済みは頻度要約と次回発火時刻を表示する', () => {
  const reminder = makeReminder({ kind: 'interval', intervalDays: 1, hour: 7, minute: 0 });
  const root = render({ enabled: true, reminder });

  const row = findByLabel(root, 'リマインダーの設定を変更')!;
  const texts = row.findAllByType(Text).map((t) => t.props.children).flat();
  expect(texts.some((t) => typeof t === 'string' && t.includes('毎日'))).toBe(true);
  expect(texts.some((t) => typeof t === 'string' && t.includes('次回'))).toBe(true);
});

test('OFF+設定済みは設定内容を表示するが次回発火時刻は表示しない(accessibilityLabelにもオフである旨を含める)', () => {
  const reminder = makeReminder();
  const root = render({ enabled: false, reminder });

  const row = findByLabel(root, 'リマインダーの設定を変更(現在オフ)')!;
  const texts = row.findAllByType(Text).map((t) => t.props.children).flat();
  expect(texts.some((t) => typeof t === 'string' && t.includes('次回'))).toBe(false);
});

test('OFF+設定済みでも行自体はopacityで薄くしない(タップできることが見た目でも伝わるようにする)', () => {
  const root = render({ enabled: false, reminder: makeReminder() });
  const row = findByLabel(root, 'リマインダーの設定を変更(現在オフ)')!;

  const flatStyle = [row.props.style].flat(Infinity).filter(Boolean);
  expect(flatStyle.some((s) => typeof s === 'object' && 'opacity' in s)).toBe(false);
});

test('設定済みの行をタップするとonPressConfigureが呼ばれる', () => {
  const onPressConfigure = jest.fn();
  const root = render({ reminder: makeReminder(), onPressConfigure });

  act(() => {
    findByLabel(root, 'リマインダーの設定を変更')!.props.onPress();
  });

  expect(onPressConfigure).toHaveBeenCalled();
});

test('未設定の促し行をタップするとonPressConfigureが呼ばれる', () => {
  const onPressConfigure = jest.fn();
  const root = render({ reminder: null, onPressConfigure });

  act(() => {
    findByLabel(root, 'リマインダーを設定')!.props.onPress();
  });

  expect(onPressConfigure).toHaveBeenCalled();
});

test('トグルを押すとonToggleEnabledが呼ばれる', () => {
  const onToggleEnabled = jest.fn();
  const root = render({ enabled: true, onToggleEnabled });

  const toggle = root.findByProps({ accessibilityRole: 'switch' });
  act(() => {
    toggle.props.onPress();
  });

  expect(onToggleEnabled).toHaveBeenCalledWith(false);
});

test('ON+permStateがdeniedのときは許可バナーを表示する', () => {
  const rootDenied = render({ enabled: true, permState: 'denied' });
  expect(rootDenied.findByProps({ state: 'denied' })).toBeDefined();
});

test('ON+permStateがgrantedのときは許可バナーを表示しない', () => {
  const rootGranted = render({ enabled: true, permState: 'granted' });
  expect(() => rootGranted.findByProps({ state: 'granted' })).toThrow();
});

test('OFFのときは許可状態に関わらず許可バナーを表示しない', () => {
  const root = render({ enabled: false, permState: 'denied' });
  expect(() => root.findByProps({ state: 'denied' })).toThrow();
});
