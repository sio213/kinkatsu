import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
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
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: false });
});

test('未完了だが値がプリセット済み（直前セットからのコピー由来）の場合、初期表示にその値を反映し編集可能なままにする', () => {
  const set = { id: 2, setNumber: 2, weight: 62.5, reps: 8, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.value).toBe('62.5');
  expect(inputs[1].props.value).toBe('8');
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: false });
});

test('入力するたびonDraftChangeにマージ後の値が渡る', () => {
  const onDraftChange = jest.fn();
  const set = { id: 3, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({
    set,
    measurementType: 'weight_reps',
    onSave: jest.fn(),
    onReopen: jest.fn(),
    onDraftChange,
  });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60');
  });
  expect(onDraftChange).toHaveBeenLastCalledWith(3, { weight: '60', reps: '' });

  act(() => {
    inputs[1].props.onChangeText('10');
  });
  expect(onDraftChange).toHaveBeenLastCalledWith(3, { weight: '60', reps: '10' });
});

describe('onAutoSaveDraft（デバウンス済みの自動保存）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('入力後400ms経過するとonAutoSaveDraftにパース済みの値が渡り、✓未タップのまま画面を離れても消えないようにする', () => {
    const onAutoSaveDraft = jest.fn();
    const set = { id: 6, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
    const root = render({
      set,
      measurementType: 'weight_reps',
      onSave: jest.fn(),
      onReopen: jest.fn(),
      onAutoSaveDraft,
    });

    const inputs = root.findAllByType(TextInput);
    act(() => {
      inputs[0].props.onChangeText('60');
    });
    expect(onAutoSaveDraft).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onAutoSaveDraft).toHaveBeenCalledWith(6, { weight: 60, reps: null });
  });

  test('連続して入力してもデバウンスされ、最後の状態で1回だけonAutoSaveDraftが呼ばれる', () => {
    const onAutoSaveDraft = jest.fn();
    const set = { id: 6, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
    const root = render({
      set,
      measurementType: 'weight_reps',
      onSave: jest.fn(),
      onReopen: jest.fn(),
      onAutoSaveDraft,
    });

    const inputs = root.findAllByType(TextInput);
    act(() => {
      inputs[0].props.onChangeText('6');
      jest.advanceTimersByTime(100);
      inputs[0].props.onChangeText('60');
      jest.advanceTimersByTime(100);
      inputs[1].props.onChangeText('10');
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(onAutoSaveDraft).toHaveBeenCalledTimes(1);
    expect(onAutoSaveDraft).toHaveBeenCalledWith(6, { weight: 60, reps: 10 });
  });

  test('"82.5"を打つ途中の"82."のような一瞬パース不能な状態でも、DB上の既存値にフォールバックしnullで上書きしない', () => {
    const onAutoSaveDraft = jest.fn();
    // reopen直後を想定: DBには確定済みの値(82.5)が残っている
    const set = { id: 6, setNumber: 1, weight: 82.5, reps: 8, completedAt: null } as any;
    const root = render({
      set,
      measurementType: 'weight_reps',
      onSave: jest.fn(),
      onReopen: jest.fn(),
      onAutoSaveDraft,
    });

    const inputs = root.findAllByType(TextInput);
    act(() => {
      inputs[0].props.onChangeText('82.'); // 入力途中の一瞬だけパース不能な状態
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // weightはnullにならずDB上の既存値(82.5)にフォールバックする。repsは未編集なので元の8のまま
    expect(onAutoSaveDraft).toHaveBeenCalledWith(6, { weight: 82.5, reps: 8 });
  });

  test('デバウンス待機中にアンマウントされても、保留中の最後の入力を取りこぼさず保存する', () => {
    const onAutoSaveDraft = jest.fn();
    const set = { id: 6, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <SetRow
          exerciseName="ベンチプレス"
          set={set}
          measurementType="weight_reps"
          onSave={jest.fn()}
          onReopen={jest.fn()}
          onAutoSaveDraft={onAutoSaveDraft}
        />,
      );
    });
    const root = instance.root;

    const inputs = root.findAllByType(TextInput);
    act(() => {
      inputs[0].props.onChangeText('60');
    });
    expect(onAutoSaveDraft).not.toHaveBeenCalled();

    // 400ms経過する前にアンマウント（画面遷移相当）
    act(() => {
      instance.unmount();
    });

    expect(onAutoSaveDraft).toHaveBeenCalledWith(6, { weight: 60, reps: null });
  });
});

test('onAutoSaveDraftが指定されていなくてもクラッシュしない（optional prop）', () => {
  const set = { id: 7, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(() => {
    act(() => {
      inputs[0].props.onChangeText('60');
    });
  }).not.toThrow();
});

test('同一レンダーサイクル内で複数フィールドを連続変更しても、onDraftChangeには両方の値がマージされて渡る（stale closure回帰防止）', () => {
  const onDraftChange = jest.fn();
  const set = { id: 4, setNumber: 1, weight: null, reps: null, completedAt: null } as any;
  const root = render({
    set,
    measurementType: 'weight_reps',
    onSave: jest.fn(),
    onReopen: jest.fn(),
    onDraftChange,
  });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60');
    inputs[1].props.onChangeText('10');
  });

  expect(onDraftChange).toHaveBeenLastCalledWith(4, { weight: '60', reps: '10' });
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

test('完了済みのセットもセルは編集可能なまま、チェックはオン表示', () => {
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.value).toBe('60');
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: true });
});

test('完了済みのセットも重量欄を編集するとonAutoSaveDraftが呼ばれる（✓は外れず値だけ直せる。回数を打ち間違えたケース向け）', () => {
  jest.useFakeTimers();
  const onAutoSaveDraft = jest.fn();
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({
    set,
    measurementType: 'weight_reps',
    onSave: jest.fn(),
    onReopen: jest.fn(),
    onAutoSaveDraft,
  });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[1].props.onChangeText('12');
  });
  act(() => {
    jest.advanceTimersByTime(400);
  });

  expect(onAutoSaveDraft).toHaveBeenCalledWith(1, { weight: 60, reps: 12 });
  expect(getCheck(root).props.accessibilityState).toEqual({ checked: true });
  jest.useRealTimers();
});

test('完了済みのセットで✓を押すとonReopenが呼ばれる（✓は完了/未完了の純粋なトグル）', async () => {
  const onReopen = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'weight_reps', onSave: jest.fn(), onReopen });

  await act(async () => {
    getCheck(root).props.onPress();
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

test('time計測タイプは分・秒の数値専用入力2つで表示・パースする', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  expect(inputs[0].props.keyboardType).toBe('number-pad');
  expect(inputs[1].props.keyboardType).toBe('number-pad');
  act(() => {
    inputs[0].props.onChangeText('1');
    inputs[1].props.onChangeText('30');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { durationSeconds: 90 });
});

test('time計測タイプは秒欄に59までは反映し、60以上は反映しない（境界値）', () => {
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[1].props.onChangeText('59');
  });
  expect(root.findAllByType(TextInput)[1].props.value).toBe('59');

  act(() => {
    root.findAllByType(TextInput)[1].props.onChangeText('60');
  });
  expect(root.findAllByType(TextInput)[1].props.value).toBe('59');
});

test('time計測タイプは秒だけの入力も許容し、分は0として保存する', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[1].props.onChangeText('45');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { durationSeconds: 45 });
});

test('time計測タイプは分だけの入力も許容し、秒は0として保存する（対称ケース）', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('5');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { durationSeconds: 300 });
});

test('time計測タイプは分・秒とも空欄のまま✓を押すとnullとして保存される', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave, onReopen: jest.fn() });

  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { durationSeconds: null });
});

test('time計測タイプは分に数字以外が混ざっても数字だけが反映される（不正貼り付け対策）', () => {
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('1a2');
  });

  expect(root.findAllByType(TextInput)[0].props.value).toBe('12');
});

test('time計測タイプは分を2桁入力すると秒欄へ自動でフォーカス移動する', () => {
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave: jest.fn(), onReopen: jest.fn() });

  const secFocusSpy = jest.spyOn(root.findAllByType(TextInput)[1].instance, 'focus');
  act(() => {
    root.findAllByType(TextInput)[0].props.onChangeText('12');
  });

  expect(secFocusSpy).toHaveBeenCalled();
});

test('time計測タイプは分が1桁のうちは秒欄へフォーカス移動しない', () => {
  const set = { id: 1, setNumber: 1, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'time', onSave: jest.fn(), onReopen: jest.fn() });

  const secFocusSpy = jest.spyOn(root.findAllByType(TextInput)[1].instance, 'focus');
  act(() => {
    root.findAllByType(TextInput)[0].props.onChangeText('1');
  });

  expect(secFocusSpy).not.toHaveBeenCalled();
});

test('time計測タイプの完了済みセットも分・秒の2入力のまま編集可能', () => {
  const set = { id: 1, setNumber: 1, durationSeconds: 90, completedAt: 123 } as any;
  const root = render({ set, measurementType: 'time', onSave: jest.fn(), onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  expect(inputs[0].props.value).toBe('1');
  expect(inputs[1].props.value).toBe('30');
});

test('distance_time計測タイプは距離(km)と時間(分・秒)の3入力で、km→m変換して保存する', async () => {
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
  expect(inputs).toHaveLength(3);
  act(() => {
    inputs[0].props.onChangeText('5');
    inputs[1].props.onChangeText('28');
    inputs[2].props.onChangeText('0');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { distanceMeters: 5000, durationSeconds: 1680 });
});

test('weight_time計測タイプは重量と時間(分・秒)の3入力で保存する', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 1, setNumber: 1, weight: null, durationSeconds: null, completedAt: null } as any;
  const root = render({ set, measurementType: 'weight_time', onSave, onReopen: jest.fn() });

  const inputs = root.findAllByType(TextInput);
  expect(inputs).toHaveLength(3);
  act(() => {
    inputs[0].props.onChangeText('20');
    inputs[2].props.onChangeText('45');
  });
  await act(async () => {
    getCheck(root).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(1, { weight: 20, durationSeconds: 45 });
});
