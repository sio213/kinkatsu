const mockOpenSettings = jest.fn();
jest.mock('@/lib/notifications/permissions', () => ({
  openSettings: (...args: unknown[]) => mockOpenSettings(...args),
}));

import { PermissionBanner } from '@/components/reminders/permission-banner';
import { IconSymbol } from '@/components/ui/icon-symbol';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

let currentInstance: ReturnType<typeof create> | undefined;

function render(props: Partial<React.ComponentProps<typeof PermissionBanner>> = {}) {
  const onRequest = jest.fn();
  act(() => {
    currentInstance = create(<PermissionBanner state="denied" onRequest={onRequest} {...props} />);
  });
  return { root: currentInstance!.root, onRequest };
}

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('deniedはwarningアイコン・「端末の通知がオフです」・本文・「設定を開く」ボタンを表示する', () => {
  const { root } = render({ state: 'denied' });

  expect(root.findAllByType(IconSymbol).some((i: ReactTestInstance) => i.props.name === 'exclamationmark.triangle.fill')).toBe(true);
  expect(root.findByProps({ children: '端末の通知がオフです' })).toBeDefined();
  expect(root.findByProps({ children: 'このままでは通知が届きません' })).toBeDefined();
  expect(root.findByProps({ accessibilityLabel: '設定を開く' })).toBeDefined();
});

test('deniedでボタンを押すとopenSettingsが呼ばれる(onRequestは呼ばれない)', () => {
  const { root, onRequest } = render({ state: 'denied' });

  act(() => {
    root.findByProps({ accessibilityLabel: '設定を開く' }).props.onPress();
  });

  expect(mockOpenSettings).toHaveBeenCalled();
  expect(onRequest).not.toHaveBeenCalled();
});

test('undeterminedは「通知の許可が必要です」と「許可する」ボタンを表示し、本文は出さない', () => {
  const { root } = render({ state: 'undetermined' });

  expect(root.findByProps({ children: '通知の許可が必要です' })).toBeDefined();
  expect(() => root.findByProps({ children: 'このままでは通知が届きません' })).toThrow();
  expect(root.findByProps({ accessibilityLabel: '許可する' })).toBeDefined();
});

test('undeterminedでボタンを押すとonRequestが呼ばれる(openSettingsは呼ばれない)', () => {
  const { root, onRequest } = render({ state: 'undetermined' });

  act(() => {
    root.findByProps({ accessibilityLabel: '許可する' }).props.onPress();
  });

  expect(onRequest).toHaveBeenCalled();
  expect(mockOpenSettings).not.toHaveBeenCalled();
});

test('undeterminedのボタンにはopen_in_newアイコンを付けない(denied専用のアクションのため)', () => {
  const { root } = render({ state: 'undetermined' });
  const btn = root.findByProps({ accessibilityLabel: '許可する' }) as ReactTestInstance;

  expect(btn.findAllByType(IconSymbol)).toHaveLength(0);
});

test('deniedのボタンにはopen_in_newアイコンを付ける', () => {
  const { root } = render({ state: 'denied' });
  const btn = root.findByProps({ accessibilityLabel: '設定を開く' }) as ReactTestInstance;

  expect(btn.findAllByType(IconSymbol).some((i: ReactTestInstance) => i.props.name === 'arrow.up.right.square')).toBe(true);
});

test('ボタンはTouchableOpacityとして表示される', () => {
  const { root } = render();
  expect(root.findAllByType(TouchableOpacity)).toHaveLength(1);
});
