const mockAddSet = jest.fn();
const mockDeleteLastSet = jest.fn();
const mockSaveSet = jest.fn();
const mockReopenSet = jest.fn();
const mockSaveDraft = jest.fn();
const mockPush = jest.fn();
const mockOnToggleCollapsed = jest.fn();

jest.mock('@/lib/workout/sets', () => ({
  addSet: (...args: unknown[]) => mockAddSet(...args),
  deleteLastSet: (...args: unknown[]) => mockDeleteLastSet(...args),
  saveSet: (...args: unknown[]) => mockSaveSet(...args),
  reopenSet: (...args: unknown[]) => mockReopenSet(...args),
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { SessionExerciseCard } from '@/components/workout/session-exercise-card';

function render(
  props: Partial<Parameters<typeof SessionExerciseCard>[0]> &
    Pick<Parameters<typeof SessionExerciseCard>[0], 'exercise' | 'sessionId' | 'sets'>,
) {
  const merged = { collapsed: false, onToggleCollapsed: mockOnToggleCollapsed, ...props };
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<SessionExerciseCard {...merged} />);
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

function findHeaderToggle(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find(
      (t) =>
        typeof t.props.accessibilityLabel === 'string' &&
        (t.props.accessibilityLabel.includes('折りたたむ') || t.props.accessibilityLabel.includes('展開する')),
    )!;
}

function findCardBody(root: ReactTestInstance) {
  return root.findByProps({ testID: 'card-body' }) as ReactTestInstance;
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
  mockSaveDraft.mockResolvedValue(undefined);
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

test('セット追加ボタンでaddSetが呼ばれる（直前セットが無いのでoverrideValuesはundefined）', async () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, undefined);
});

test('直前セットが✓未タップのまま入力中の場合、その入力値をoverrideValuesとしてaddSetに渡す', async () => {
  const sets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60');
  });
  act(() => {
    inputs[1].props.onChangeText('10');
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: 60, reps: 10 });
});

test('直前セットが✓タップ済みの場合は入力途中の値を使わず、addSet側の既定コピーに任せる（overrideValues省略）', async () => {
  const sets = [{ id: 9, setNumber: 1, weight: 60, reps: 10, completedAt: 1 }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, undefined);
});

test('直前セットが✓未タップでも一度も入力に触れていない場合は、addSet側の既定コピーに任せる（overrideValues省略）', async () => {
  const sets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });
  // 何も入力しない

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, undefined);
});

test('直前セットの入力途中の値がパース不可能で、DB側にもフォールバック値が無い場合はnullになる（Alertは出ない）', async () => {
  const sets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60kg'); // 単位付きの不正な入力
    inputs[1].props.onChangeText('10');
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: null, reps: 10 });
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('直前セットの入力途中の値がパース不可能でも、DB側に既存値があればそれにフォールバックする（タイプミスで値を失わないため）', async () => {
  // reopen由来などでDBには以前の確定値(80/6)が残っている状態を想定
  const sets = [{ id: 9, setNumber: 1, weight: 80, reps: 6, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('60kg'); // 単位付きの不正な入力（タイプミス想定）
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  // weightは不正入力なのでDBの80にフォールバック、reps欄は未編集のため元のDB表示値(6)のまま
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: 80, reps: 6 });
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('直前セットを✓再タップで編集に戻した直後にセット追加すると、reopen由来の値がoverrideValuesとして渡る', async () => {
  mockReopenSet.mockResolvedValue(undefined);
  const initialSets = [{ id: 9, setNumber: 1, weight: 62.5, reps: 8, completedAt: 123 }] as any;

  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <SessionExerciseCard
        exercise={exercise}
        sessionId={1}
        sets={initialSets}
        collapsed={false}
        onToggleCollapsed={mockOnToggleCollapsed}
      />,
    );
  });
  const root = instance.root;

  const checkbox = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityRole === 'checkbox')!;
  await act(async () => {
    checkbox.props.onPress();
  });
  expect(mockReopenSet).toHaveBeenCalledWith(9);

  // 実運用ではreopenSet完了後、live queryでcompletedAtがnullに更新されて再描画される
  const reopenedSets = [{ ...initialSets[0], completedAt: null }];
  act(() => {
    instance.update(
      <SessionExerciseCard
        exercise={exercise}
        sessionId={1}
        sets={reopenedSets}
        collapsed={false}
        onToggleCollapsed={mockOnToggleCollapsed}
      />,
    );
  });

  const addBtn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: 62.5, reps: 8 });
});

test('入力してデバウンス時間が経過するとsaveDraftが呼ばれ、✓未タップの入力が画面を離れても消えないようにDBへ保存される（バグ回帰防止）', () => {
  jest.useFakeTimers();
  const sets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[1].props.onChangeText('10');
  });
  expect(mockSaveDraft).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(400);
  });
  expect(mockSaveDraft).toHaveBeenCalledWith(9, { weight: null, reps: 10 });
  jest.useRealTimers();
});

test('入力途中の値が0の場合、overrideValuesでも0のままコピーされる（SetRow→addSetの結合経路での境界値）', async () => {
  const sets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('0');
    inputs[1].props.onChangeText('0');
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: 0, reps: 0 });
});

test('time計測タイプで直前セットの入力途中の時間(mm:ss)をoverrideValuesとして秒数に変換してコピーする', async () => {
  const timeExercise = { ...exercise, measurementType: 'time' };
  const sets = [{ id: 9, setNumber: 1, durationSeconds: null, completedAt: null }] as any;
  const root = render({ exercise: timeExercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('1:30');
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { durationSeconds: 90 });
});

test('weight_time計測タイプで直前セットの入力途中の重量・時間をoverrideValuesとしてコピーする', async () => {
  const weightTimeExercise = { ...exercise, measurementType: 'weight_time' };
  const sets = [{ id: 9, setNumber: 1, weight: null, durationSeconds: null, completedAt: null }] as any;
  const root = render({ exercise: weightTimeExercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('40');
    inputs[1].props.onChangeText('0:45');
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { weight: 40, durationSeconds: 45 });
});

test('distance_time計測タイプで距離だけ入力途中・時間は未入力のままセット追加すると、部分的にoverrideValuesへ反映される', async () => {
  const distanceExercise = { ...exercise, measurementType: 'distance_time' };
  const sets = [
    { id: 9, setNumber: 1, distanceMeters: null, durationSeconds: null, completedAt: null },
  ] as any;
  const root = render({ exercise: distanceExercise, sessionId: 1, sets });

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('5'); // 距離(km)だけ入力
  });

  const btn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    btn.props.onPress();
  });
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, { distanceMeters: 5000, durationSeconds: null });
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

test('セット削除後に別idの新しいセットが同じ位置に来ても、削除済みセットの古いdraftは使われない', async () => {
  const initialSets = [{ id: 9, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <SessionExerciseCard
        exercise={exercise}
        sessionId={1}
        sets={initialSets}
        collapsed={false}
        onToggleCollapsed={mockOnToggleCollapsed}
      />,
    );
  });
  const root = instance.root;

  const inputs = root.findAllByType(TextInput);
  act(() => {
    inputs[0].props.onChangeText('999');
  });

  const deleteBtn = findButtonByLabel(root, 'セット削除')!;
  await act(async () => {
    deleteBtn.props.onPress();
  });
  expect(mockDeleteLastSet).toHaveBeenCalledWith(500);

  // 削除後、別id(20)の新しいセットが同じ位置に来た状態を再現（idは使い回されない前提）
  const newSets = [{ id: 20, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  act(() => {
    instance.update(
      <SessionExerciseCard
        exercise={exercise}
        sessionId={1}
        sets={newSets}
        collapsed={false}
        onToggleCollapsed={mockOnToggleCollapsed}
      />,
    );
  });

  const addBtn = findButtonByLabel(root, 'セット追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });
  // 旧id(9)の"999"が誤って使われず、addSet側の既定コピーに委ねられる（overrideValues省略）
  expect(mockAddSet).toHaveBeenCalledWith(1, 10, 500, undefined);
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

test('ⓘアイコンをタップすると種目詳細画面へ遷移する', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const infoBtn = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityLabel === 'ベンチプレスの詳細を見る')!;
  act(() => {
    infoBtn.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith('/exercise/10');
});

test('ⓘアイコンの連打でもpushは1回しか呼ばれない（useDebouncedPushによる二重遷移防止）', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const infoBtn = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityLabel === 'ベンチプレスの詳細を見る')!;
  act(() => {
    infoBtn.props.onPress();
    infoBtn.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('デフォルト(collapsed=false)では展開されており、セット一覧・セット追加/削除ボタンが表示される', () => {
  const sets = [{ id: 1, setNumber: 1, weight: null, reps: null, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets });
  const header = findHeaderToggle(root);
  expect(header.props.accessibilityLabel).toBe('ベンチプレスを折りたたむ');
  expect(header.props.accessibilityState).toEqual({ expanded: true });
  expect(findButtonByLabel(root, 'セット追加')).toBeDefined();
  const body = findCardBody(root);
  expect(body.props.style).toEqual([expect.anything(), false]);
});

test('collapsed=trueのときは折りたたみ表示になり、セット数のサマリーが出てbodyは非表示スタイルになる', () => {
  const sets = [
    { id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 },
    { id: 2, setNumber: 2, weight: null, reps: null, completedAt: null },
  ] as any;
  const root = render({ exercise, sessionId: 1, sets, collapsed: true });

  const header = findHeaderToggle(root);
  expect(header.props.accessibilityLabel).toBe('ベンチプレス、2セット、展開する');
  expect(header.props.accessibilityState).toEqual({ expanded: false });
  const summaryText = root
    .findAllByType(Text)
    .find((t) => [t.props.children].flat().join('') === '2セット');
  expect(summaryText).toBeDefined();

  const body = findCardBody(root);
  const flattenedStyle = [body.props.style].flat(2);
  expect(flattenedStyle).toEqual(expect.arrayContaining([{ display: 'none' }]));
});

test('ヘッダーをタップするとonToggleCollapsedがsessionExerciseId付きで呼ばれる（開閉の実体は親が持つ）', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  act(() => {
    findHeaderToggle(root).props.onPress();
  });
  expect(mockOnToggleCollapsed).toHaveBeenCalledWith(500);
});

test('ⓘアイコンをタップしてもonToggleCollapsedは呼ばれない（ネストしたTouchableで独立して処理される）', () => {
  const root = render({ exercise, sessionId: 1, sets: [] });
  const infoBtn = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityLabel === 'ベンチプレスの詳細を見る')!;

  act(() => {
    infoBtn.props.onPress();
  });

  expect(mockOnToggleCollapsed).not.toHaveBeenCalled();
});

test('折りたたんでいても値未入力でない既存のTextInput(SetRow)はアンマウントされず残っている', () => {
  const sets = [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: null }] as any;
  const root = render({ exercise, sessionId: 1, sets, collapsed: true });
  // bodyがdisplay:noneで隠れていてもSetRowのTextInputはツリーに残り続ける（アンマウントされない）
  expect(root.findAllByType(TextInput)).toHaveLength(2);
});
