const mockAddSet = jest.fn();
const mockDeleteLastSet = jest.fn();
const mockSaveSet = jest.fn();
const mockReopenSet = jest.fn();

jest.mock('@/lib/workout/sets', () => ({
  addSet: (...args: unknown[]) => mockAddSet(...args),
  deleteLastSet: (...args: unknown[]) => mockDeleteLastSet(...args),
  saveSet: (...args: unknown[]) => mockSaveSet(...args),
  reopenSet: (...args: unknown[]) => mockReopenSet(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { SessionExerciseCard } from '@/components/workout/session-exercise-card';

function render(props: Parameters<typeof SessionExerciseCard>[0]) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<SessionExerciseCard {...props} />);
  });
  return instance.root;
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

const exercise = {
  id: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  orderIndex: 0,
  sessionExerciseId: 500,
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockAddSet.mockResolvedValue(undefined);
  mockDeleteLastSet.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('計測タイプに応じた列見出しを表示する', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  expect(root.findByProps({ children: '重量(kg)' })).toBeDefined();
  expect(root.findByProps({ children: '回数' })).toBeDefined();
});

test('セット数だけSetRowが描画される', () => {
  const sets = [
    { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 },
    { id: 2, setNumber: 2, weight: null, reps: null, completedAt: null },
  ] as any;
  const root = render({ exercise, sessionId: 1, sets });
  // 各セット行はチェックボックスとして1つ描画される
  const checkboxes = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityRole === 'checkbox');
  expect(checkboxes).toHaveLength(2);
});

test('セット追加ボタンでaddSetが呼ばれる', async () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500);
});

test('セットが0件のときセット削除ボタンは無効', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット削除')!;
  expect(btn.props.disabled).toBe(true);
});

test('最後のセットが未入力（未完了）のときは確認無しで即座にdeleteLastSetが呼ばれる', async () => {
  const sets = [{ id: 1, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });
  const btn = findButtonByLabel(root, 'セット削除')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockDeleteLastSet).toHaveBeenCalledWith(500);
});

test('最後のセットが完了済み（値あり）のときは確認ダイアログを出し、確定するとdeleteLastSetが呼ばれる', async () => {
  const sets = [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 }] as any;
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '削除');
    confirmBtn?.onPress?.();
  });
  const root = render({ exercise, sessionId: 1, sets });
  const btn = findButtonByLabel(root, 'セット削除')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(Alert.alert).toHaveBeenCalledWith(
    'このセットを削除しますか？',
    '入力した記録が失われます。',
    expect.anything(),
  );
  expect(mockDeleteLastSet).toHaveBeenCalledWith(500);
});

test('削除確認をキャンセルするとdeleteLastSetは呼ばれない', async () => {
  const sets = [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 }] as any;
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = render({ exercise, sessionId: 1, sets });
  const btn = findButtonByLabel(root, 'セット削除')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockDeleteLastSet).not.toHaveBeenCalled();
});

test('セット追加が失敗した場合はエラーAlertを表示する', async () => {
  mockAddSet.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'セットを追加できませんでした。');
});

test('reps計測タイプの種目は回数列のみ表示する', () => {
  const repsExercise = { ...exercise, measurementType: 'reps' };
  const root = render({ exercise: repsExercise, sessionId: 1, sets: [] });
  expect(root.findByProps({ children: '回数' })).toBeDefined();
  expect(() => root.findByProps({ children: '重量(kg)' })).toThrow();
});

test('セット追加の連打でもaddSetは1回しか呼ばれない', async () => {
  let resolveAdd!: () => void;
  mockAddSet.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット追加')!;
  act(() => {
    btn.props.onPress();
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveAdd();
  });
});

test('TextInputが計測タイプの列数と一致する', () => {
  const root = render({ exercise, sessionId: 1, sets: [{ id: 1, setNumber: 1, weight: null, reps: null, completedAt: null }] as any });
  expect(root.findAllByType(TextInput)).toHaveLength(2);
});

test('列見出しの1列目に「セット」ラベルを表示する', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  expect(root.findByProps({ children: 'セット' })).toBeDefined();
});

test('未知のmeasurementTypeでもクラッシュせず重量×回数にフォールバックする', () => {
  const unknownExercise = { ...exercise, measurementType: 'unknown_type' };
  expect(() => render({ exercise: unknownExercise, sessionId: 1, sets: [] })).not.toThrow();
  const root = render({ exercise: unknownExercise, sessionId: 1, sets: [] });
  expect(root.findByProps({ children: '重量(kg)' })).toBeDefined();
});

test('セット削除ボタンは0件のときaccessibilityStateがdisabledになる', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット削除')!;
  expect(btn.props.accessibilityState).toEqual({ disabled: true });
});
