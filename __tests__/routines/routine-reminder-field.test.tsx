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

// 設定行(box)。permStateがdenied/undeterminedのときはPermissionBannerの「設定を開く」/
// 「許可する」ボタンもaccessibilityRole="button"のTouchableOpacityとして同時に存在するため、
// box特有のaccessibilityLabel(「通知タイミングを設定」または「タップして変更」を含む)で絞り込む
function findBox(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find(
      (t) =>
        typeof t.props.accessibilityLabel === 'string' &&
        (t.props.accessibilityLabel.includes('通知タイミングを設定') ||
          t.props.accessibilityLabel.includes('タップして変更')),
    );
}

function boxOpacity(box: ReactTestInstance): number | undefined {
  const flat = [box.props.style].flat(Infinity).filter(Boolean) as { opacity?: number }[];
  return flat.find((s) => typeof s === 'object' && 'opacity' in s)?.opacity;
}

test('OFF+未設定は設定行を一切表示しない', () => {
  const root = render({ enabled: false, reminder: null });
  expect(findBox(root)).toBeUndefined();
});

test('ON+未設定は「通知タイミングを設定」の設定行を表示し、ヒント文言も出す', () => {
  const root = render({ enabled: true, reminder: null });
  const box = findBox(root)!;
  const texts = box.findAllByType(Text).map((t) => t.props.children).flat();
  expect(texts).toContain('通知タイミングを設定');
  expect(texts).toContain('タップして設定');
  expect(box.props.disabled).toBe(false);
  expect(root.findByProps({ children: '未設定のうちは通知されません。' })).toBeDefined();
});

test('ON+未設定でもhasError:trueのときはヒント文言を出さない(バリデーションエラー表示と同時に出ないようにする)', () => {
  const root = render({ enabled: true, reminder: null, hasError: true });
  expect(() => root.findByProps({ children: '未設定のうちは通知されません。' })).toThrow();
});

test('ON+設定済みは頻度要約と次回発火時刻を表示する', () => {
  const reminder = makeReminder({ kind: 'interval', intervalDays: 1, hour: 7, minute: 0 });
  const root = render({ enabled: true, reminder });

  const box = findBox(root)!;
  const boxTexts = box.findAllByType(Text).map((t) => t.props.children).flat();
  expect(boxTexts.some((t) => typeof t === 'string' && t.includes('毎日'))).toBe(true);
  expect(box.props.disabled).toBe(false);
  expect(boxOpacity(box)).toBe(1);

  const allTexts = root.findAllByType(Text).map((t) => t.props.children).flat();
  expect(allTexts.some((t) => typeof t === 'string' && t.includes('次回'))).toBe(true);
});

test('OFF+設定済みは設定内容を保持したまま薄いグレー(opacity .45)でDisabledにする(デザイン案どおり操作不可)', () => {
  const reminder = makeReminder();
  const root = render({ enabled: false, reminder });

  const box = findBox(root)!;
  expect(box.props.disabled).toBe(true);
  expect(boxOpacity(box)).toBe(0.45);

  const boxTexts = box.findAllByType(Text).map((t) => t.props.children).flat();
  expect(boxTexts.some((t) => typeof t === 'string' && t.includes('毎日'))).toBe(true);
});

test('OFF+設定済みは次回発火時刻を表示しない', () => {
  const root = render({ enabled: false, reminder: makeReminder() });
  const allTexts = root.findAllByType(Text).map((t) => t.props.children).flat();
  expect(allTexts.some((t) => typeof t === 'string' && t.includes('次回'))).toBe(false);
});

test('ON+設定済みだが端末通知が拒否されているときは、設定行をopacity .6でDisabledにし次回発火時刻も出さない', () => {
  const root = render({ enabled: true, reminder: makeReminder(), permState: 'denied' });

  const box = findBox(root)!;
  // 許可されるまで設定画面を開いても通知は届かないため、遷移自体を止める
  expect(box.props.disabled).toBe(true);
  expect(boxOpacity(box)).toBe(0.6);
  expect(box.props.accessibilityLabel).toContain('通知が許可されていません');

  const allTexts = root.findAllByType(Text).map((t) => t.props.children).flat();
  expect(allTexts.some((t) => typeof t === 'string' && t.includes('次回'))).toBe(false);
});

test('ON+未設定だが端末通知が拒否されているときも、設定行をDisabledにする', () => {
  const root = render({ enabled: true, reminder: null, permState: 'undetermined' });

  const box = findBox(root)!;
  expect(box.props.disabled).toBe(true);
  expect(boxOpacity(box)).toBe(0.6);
  expect(box.props.accessibilityLabel).toContain('通知が許可されていません');
});

test('設定行をタップするとonPressConfigureが呼ばれる(設定済み・未設定どちらも)', () => {
  const onPressConfigure = jest.fn();
  const root = render({ reminder: makeReminder(), onPressConfigure });

  act(() => {
    findBox(root)!.props.onPress();
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

test('トグルの見出しは「通知する」(フィールド見出し「リマインダー」との重複を避ける)', () => {
  const root = render({ enabled: true });
  expect(root.findByProps({ children: '通知する' })).toBeDefined();
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
