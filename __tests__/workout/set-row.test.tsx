import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, TextInput, TouchableOpacity } from 'react-native';
import { SetRow } from '@/components/workout/set-row';

function render(props: Omit<Parameters<typeof SetRow>[0], 'exerciseName'> & { exerciseName?: string }) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<SetRow exerciseName="ベンチプレス" {...props} />);
  });
  return instance.root;
}

function getCheck(root: ReactTestInstance) {
  return root.findByProps({ accessibilityRole: 'checkbox' });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('未完了のセットは重量・回数が編集可能で、チェックはオフ表示', () => {
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  expect(inputs[0].props.editable).toBe(true);
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: false });
});

test('✓を押すと入力値をパースしてonSaveが呼ばれる', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60');
    inputs[1].props.onChangeText('10');
  });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { weight: 60, reps: 10 });
});

test('パースできない不正な入力があると保存せずエラーAlertを表示する', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('六十'); // 数値として解釈できない不正な入力
    inputs[1].props.onChangeText('10');
  });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('入力エラー', '重量(kg)の値を確認してください。');
});

test('空欄のまま✓を押すのは許容され、nullとして保存される', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60');
    // reps欄は空欄のまま
  });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { weight: 60, reps: null });
});

test('完了済みのセットはセルが編集不可になりチェックはオン表示', () => {
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.editable).toBe(false);
  expect(inputs[0].props.value).toBe('60');
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: true });
});

test('完了済みのセットで✓を押すとonReopenが呼ばれる', async () => {
  const onReopen = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onReopen).toHaveBeenCalledWith(1);
});

test('完了済みのセルをタップしてもonReopenが呼ばれる（チェック以外からも編集に戻せる）', async () => {
  const onReopen = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen });

  const cellButton = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityLabel === 'ベンチプレス セット1を編集');
  expect(cellButton).toBeDefined();

  await act(async () => {
    cellButton!.props.onPress();
  });

  expect(onReopen).toHaveBeenCalledWith(1);
});

test('✓連打してもonSaveは1回しか呼ばれない', async () => {
  let resolveSave!: () => void;
  const onSave = jest.fn().mockReturnValue(
    new Promise<void>((resolve) => {
      resolveSave = resolve;
    }),
  );
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave, onReopen: jest.fn() });

  act(() => {
    getCheck(root).props.onPress();
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveSave();
  });
});

test('onSaveが失敗した場合はエラーAlertを表示する', async () => {
  const onSave = jest.fn().mockRejectedValue(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const set = { id: 1, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave, onReopen: jest.fn() });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'セットを保存できませんでした。');
});

test('reps計測タイプは入力欄が1つだけ', () => {
  const set = { id: 1, setNumber: 1, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'reps', onSave: jest.fn(), onReopen: jest.fn() });
  expect(root.findAllByType(TextInput)).toHaveLength(1);
});

test('time計測タイプは時間(分:秒)を表示・パースする', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave, onReopen: jest.fn() });

  const input = root.findByType(TextInput);
  act(() => {
    input.props.onChangeText('1:30');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { durationSeconds: 90 });
});

test('distance_time計測タイプは距離(km)と時間の2列で、km→m変換して保存する', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = {
    id: 1,
    setNumber: 1,
    distanceMeters: null,
    durationSeconds: null,
    completedAt: null,
  } as any;
  const root = render({ set, measurementType: 'distance_time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  act(() => {
    inputs[0].props.onChangeText('5');
    inputs[1].props.onChangeText('28:00');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { distanceMeters: 5000, durationSeconds: 1680 });
});

test('weight_time計測タイプは重量と時間の2列で保存する', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: null, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  act(() => {
    inputs[0].props.onChangeText('20');
    inputs[1].props.onChangeText('0:45');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { weight: 20, durationSeconds: 45 });
});
