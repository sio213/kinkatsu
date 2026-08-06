import { RoutineSavePromptCard } from '@/components/workout/routine-save-prompt-card';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  const onSave = jest.fn();
  const onDismiss = jest.fn();
  act(() => {
    currentInstance = create(<RoutineSavePromptCard onSave={onSave} onDismiss={onDismiss} />);
  });
  return { root: currentInstance!.root, onSave, onDismiss };
}

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

function texts(root: ReactTestInstance): string[] {
  return root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}

function buttonByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label);
}

test('機能名だけでなく利得も出す（未使用者には機能名だけでは価値が伝わらない）', () => {
  const { root } = render();

  expect(texts(root)).toEqual(
    expect.arrayContaining(['このメニューをルーティンとして保存', '次回から1タップで同じメニューを開始できます']),
  );
});

test('「保存する」でonSaveを呼ぶ', () => {
  const { root, onSave, onDismiss } = render();

  act(() => {
    buttonByLabel(root, '保存する')!.props.onPress();
  });

  expect(onSave).toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
});

// 「今はしない」だと「今回は見送る＝また今度出る」と読めるが、実際は永久に消える
test('断るボタンの文言は永続であることが読める「今後表示しない」', () => {
  const { root, onDismiss, onSave } = render();
  const dismiss = buttonByLabel(root, '今後表示しない');

  expect(dismiss).toBeDefined();
  act(() => {
    dismiss!.props.onPress();
  });

  expect(onDismiss).toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
});

// 文字だけのボタンは実高さが16pt程度しかなく、隣の塗りボタンと押し間違えやすい
test('小さいボタンは当たり判定を広げる（44pt確保）', () => {
  const { root } = render();

  expect(buttonByLabel(root, '保存する')!.props.hitSlop).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
  expect(buttonByLabel(root, '今後表示しない')!.props.hitSlop).toEqual({ top: 14, bottom: 14, left: 8, right: 8 });
});
