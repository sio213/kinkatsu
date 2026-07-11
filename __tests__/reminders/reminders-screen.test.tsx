const mockUseReminders = jest.fn();
const mockGetPermissionState = jest.fn();
const mockEnsurePermission = jest.fn();

jest.mock('expo-router', () => ({
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（追加ボタン）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => {
      const { createElement, Fragment } = require('react');
      return createElement(Fragment, null, options?.headerRight?.());
    },
  },
}));

jest.mock('@/hooks/use-reminders', () => ({
  useReminders: () => mockUseReminders(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/lib/notifications/permissions', () => ({
  getPermissionState: () => mockGetPermissionState(),
  ensurePermission: () => mockEnsurePermission(),
}));

// ReminderForm(DateTimePicker等の実装詳細)とReminderCardはこのテストの対象外。
// showForm/editTargetIdの切り替えとheaderRightの表示/非表示だけを検証したいので、
// onEdit/onSubmit/onCancelを外から呼べる最小限のスタブに差し替える
jest.mock('@/components/reminders/reminder-card', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ReminderCard: ({ reminder, onEdit }: { reminder: { id: number; title: string }; onEdit: () => void }) => (
      <TouchableOpacity accessibilityLabel={`${reminder.title}を編集`} onPress={onEdit}>
        <Text>{reminder.title}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('@/components/reminders/reminder-form', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ReminderForm: ({ onCancel }: { onCancel: () => void }) => (
      <TouchableOpacity accessibilityLabel="フォームを閉じる" onPress={onCancel}>
        <Text>フォーム</Text>
      </TouchableOpacity>
    ),
  };
});

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import RemindersScreen from '@/app/(tabs)/reminders';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

// マウント時にuseReminders内部のgetPermissionState().then(setPermState)がawaitされずに
// 発火するため、そのmicrotaskをここで一度flushしてから返す
// （flushしないとテスト終了後にstate更新が走り、Jest環境teardown後のエラーになる）
async function render() {
  let instance!: ReturnType<typeof create>;
  await act(async () => {
    instance = create(React.createElement(RemindersScreen));
  });
  return instance.root;
}

function baseReminders(overrides: Partial<ReturnType<typeof mockUseReminders>> = {}) {
  return {
    reminders: [],
    createReminder: jest.fn(),
    updateReminder: jest.fn(),
    toggleReminder: jest.fn(),
    removeReminder: jest.fn(),
    getNextFire: jest.fn(),
    now: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermissionState.mockResolvedValue('granted');
  mockUseReminders.mockReturnValue(baseReminders());
});

test('初期表示ではヘッダーに「追加」ボタンを表示する', async () => {
  const root = await render();
  expect(findButtonByLabel(root, '追加')).toBeDefined();
});

test('「追加」ボタン押下でフォームが開き、ヘッダーの「追加」ボタンは消える', async () => {
  const root = await render();

  const headerAddBtn = findButtonByLabel(root, '追加')!;
  act(() => {
    headerAddBtn.props.onPress();
  });

  expect(root.findByProps({ children: 'フォーム' })).toBeDefined();
  expect(findButtonByLabel(root, '追加')).toBeUndefined();
});

test('既存リマインダーの編集を開始した場合もヘッダーの「追加」ボタンは消える', async () => {
  mockUseReminders.mockReturnValue(
    baseReminders({ reminders: [{ id: 1, title: 'スクワット', enabled: true } as never] }),
  );
  const root = await render();

  const editBtn = findByAccessibilityLabel(root, 'スクワットを編集')!;
  act(() => {
    editBtn.props.onPress();
  });

  expect(findButtonByLabel(root, '追加')).toBeUndefined();
});

test('フォームをキャンセルすると、ヘッダーの「追加」ボタンが再表示される', async () => {
  const root = await render();

  const headerAddBtn = findButtonByLabel(root, '追加')!;
  act(() => {
    headerAddBtn.props.onPress();
  });
  expect(findButtonByLabel(root, '追加')).toBeUndefined();

  const closeBtn = findByAccessibilityLabel(root, 'フォームを閉じる')!;
  act(() => {
    closeBtn.props.onPress();
  });

  expect(findButtonByLabel(root, '追加')).toBeDefined();
});
