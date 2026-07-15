const mockPush = jest.fn();
const mockRemoveExerciseAt = jest.fn();
const mockUpdateExerciseSets = jest.fn();
const mockMoveExerciseAt = jest.fn();
// letで再代入可能にし、テストごとに「過去の記録読み込み」等の外部差し替えを模擬できるようにする
let mockLastSetsReplacement: { index: number; token: number } | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: any) => unknown) =>
    selector({
      removeExerciseAt: mockRemoveExerciseAt,
      updateExerciseSets: mockUpdateExerciseSets,
      moveExerciseAt: mockMoveExerciseAt,
      get lastSetsReplacement() {
        return mockLastSetsReplacement;
      },
    }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import {
  RoutineTemplateExerciseCard,
  type RoutineTemplateExerciseCardHandle,
} from '@/components/routines/routine-template-exercise-card';
import type { DraftExercise } from '@/lib/routines/validation';

function makeExercise(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    exerciseId: 5,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench_press',
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    ...overrides,
  };
}

function render(
  exercise: DraftExercise,
  index = 0,
  overrides: Partial<{ isFirst: boolean; isLast: boolean; hasHistory: boolean }> = {},
) {
  const props = { isFirst: false, isLast: false, hasHistory: true, ...overrides };
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<RoutineTemplateExerciseCard exercise={exercise} index={index} {...props} />);
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

function findMenuTrigger(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'メニューを開く');
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastSetsReplacement = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('種目名・セット値が表示される', () => {
  const root = render(makeExercise());
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.value).toBe('60');
  expect(inputs[1].props.value).toBe('8');
});

test('折りたたむとセット表がdisplay:noneになる', () => {
  const root = render(makeExercise());
  const toggle = root.findByProps({ accessibilityLabel: 'ベンチプレスを折りたたむ' });

  act(() => {
    toggle.props.onPress();
  });

  const body = root.findByProps({ testID: 'card-body' });
  expect(body.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ display: 'none' })]));
});

test('セット追加を押すと直前セットの値をコピーした1件が足される（トレーニング中画面と同じ挙動）', () => {
  const root = render(makeExercise());
  const addBtn = findButtonByLabel(root, 'セット追加')!;

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セットが0件の状態でセット追加を押すと空欄のセットが1件足される', () => {
  const root = render(makeExercise({ sets: [] }));
  const addBtn = findButtonByLabel(root, 'セット追加')!;

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セット削除(末尾)を押すと最後のセットが取り除かれる', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const deleteBtn = findButtonByLabel(root, 'セット削除')!;

  act(() => {
    deleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
  ]);
});

test('行ごとの✕でその行だけが取り除かれる（末尾に限らない）', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 4, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const rowDeleteBtn = root.findByProps({ accessibilityLabel: 'ベンチプレス セット2を削除' });

  act(() => {
    rowDeleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    { weight: 60, reps: 4, durationSeconds: null, distanceMeters: null },
  ]);
});

test('先頭行の✕でも狙った行だけが取り除かれる', () => {
  const exercise = makeExercise({
    sets: [
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
    ],
  });
  const root = render(exercise);
  const rowDeleteBtn = root.findByProps({ accessibilityLabel: 'ベンチプレス セット1を削除' });

  act(() => {
    rowDeleteBtn.props.onPress();
  });

  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, [
    { weight: 60, reps: 6, durationSeconds: null, distanceMeters: null },
  ]);
});

test('セットが0件のとき、セット削除ボタンはdisabledで押しても何も起きない', () => {
  const root = render(makeExercise({ sets: [] }));
  const deleteBtn = findButtonByLabel(root, 'セット削除')!;

  expect(deleteBtn.props.accessibilityState).toEqual({ disabled: true });

  act(() => {
    deleteBtn.props.onPress();
  });
  expect(mockUpdateExerciseSets).toHaveBeenCalledWith(0, []);
});

test('⋮メニューの削除確認でキャンセルするとremoveExerciseAtは呼ばれない', () => {
  const root = render(makeExercise());
  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, '削除')!.props.onPress();
  });

  const cancelHandler = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === 'キャンセル').onPress;
  act(() => {
    cancelHandler?.();
  });

  expect(mockRemoveExerciseAt).not.toHaveBeenCalled();
});

test('⋮メニューの削除は確認ダイアログを経てremoveExerciseAtを呼ぶ', () => {
  const root = render(makeExercise(), 3);
  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });

  act(() => {
    findMenuItem(root, '削除')!.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalled();
  const confirmHandler = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === '削除').onPress;
  act(() => {
    confirmHandler();
  });

  expect(mockRemoveExerciseAt).toHaveBeenCalledWith(3);
});

test('ⓘを押すと種目詳細へ遷移する', () => {
  const root = render(makeExercise());
  const infoBtn = root.findByProps({ accessibilityLabel: 'ベンチプレスの詳細を見る' });

  act(() => {
    infoBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/5');
});

describe('⋮メニュー: 上へ移動/下へ移動', () => {
  test('「上へ移動」を押すとmoveExerciseAt(index, "up")が呼ばれる', () => {
    const root = render(makeExercise(), 2);
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    act(() => {
      findMenuItem(root, '上へ移動')!.props.onPress();
    });
    expect(mockMoveExerciseAt).toHaveBeenCalledWith(2, 'up');
  });

  test('「下へ移動」を押すとmoveExerciseAt(index, "down")が呼ばれる', () => {
    const root = render(makeExercise(), 2);
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    act(() => {
      findMenuItem(root, '下へ移動')!.props.onPress();
    });
    expect(mockMoveExerciseAt).toHaveBeenCalledWith(2, 'down');
  });

  test('isFirst=trueのとき「上へ移動」は無効になる', () => {
    const root = render(makeExercise(), 0, { isFirst: true });
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    expect(findMenuItem(root, '上へ移動')!.props.disabled).toBe(true);
  });

  test('isLast=trueのとき「下へ移動」は無効になる', () => {
    const root = render(makeExercise(), 0, { isLast: true });
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    expect(findMenuItem(root, '下へ移動')!.props.disabled).toBe(true);
  });
});

describe('⋮メニュー: 種目を入れ替え', () => {
  test('セットに値が無ければhasRecordedData: falseを渡してルーティン用の入れ替え画面へ遷移する', () => {
    const root = render(makeExercise({ sets: [] }), 1);
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    act(() => {
      findMenuItem(root, '種目を入れ替え')!.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/routine/exercise-swap',
      params: {
        index: '1',
        currentExerciseId: '5',
        currentExerciseName: 'ベンチプレス',
        hasRecordedData: 'false',
      },
    });
  });

  test('セットに値が1つでもあればhasRecordedData: trueを渡す', () => {
    const root = render(makeExercise(), 1);
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    act(() => {
      findMenuItem(root, '種目を入れ替え')!.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ hasRecordedData: 'true' }) }),
    );
  });
});

describe('⋮メニュー: 過去の記録から読み込む', () => {
  test('hasHistory=falseのとき無効になり、タップしても遷移しない', () => {
    const root = render(makeExercise(), 0, { hasHistory: false });
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    const item = findMenuItem(root, '過去の記録から読み込む')!;
    expect(item.props.disabled).toBe(true);

    act(() => {
      item.props.onPress();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('hasHistory=trueのとき、ルーティン用の記録読み込み画面へこの種目の情報を渡して遷移する', () => {
    const root = render(makeExercise({ sets: [] }), 1, { hasHistory: true });
    act(() => {
      findMenuTrigger(root)!.props.onPress();
    });
    act(() => {
      findMenuItem(root, '過去の記録から読み込む')!.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/routine/history-picker',
      params: {
        index: '1',
        exerciseId: '5',
        exerciseName: 'ベンチプレス',
        hasRecordedData: 'false',
      },
    });
  });
});

describe('過去の記録読み込み(lastSetsReplacement)による表示の再同期(回帰テスト)', () => {
  // RoutineTemplateSetRowはマウント時にしかpropsから表示値を取り込まないため、このカード自身の
  // 追加/削除/値編集を経ずにsetsが丸ごと外部から差し替わった場合、rowKeysを追従させないと
  // 古い値が表示され続けてしまう。lastSetsReplacementでこの外部差し替えを検知し、
  // rowKeysを総入れ替えして全行を再マウントさせることで最新値を反映させる
  test('同じ行数のまま値だけが外部から差し替わっても、表示は新しい値に更新される', () => {
    const before = makeExercise({
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    });
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <RoutineTemplateExerciseCard exercise={before} index={0} isFirst={false} isLast={false} hasHistory={true} />,
      );
    });

    // 過去の記録読み込み画面がloadSetsIntoExerciseAt(0, ...)を呼んだ状況を模擬する:
    // ストアのexercises(propsとして渡すexercise)が新しい値になり、同時にlastSetsReplacementも更新される
    const after = makeExercise({
      sets: [{ weight: 100, reps: 3, durationSeconds: null, distanceMeters: null }],
    });
    mockLastSetsReplacement = { index: 0, token: 12345 };
    act(() => {
      instance.update(
        <RoutineTemplateExerciseCard exercise={after} index={0} isFirst={false} isLast={false} hasHistory={true} />,
      );
    });

    const inputs = instance.root.findAllByType(TextInput);
    expect(inputs[0].props.value).toBe('100');
    expect(inputs[1].props.value).toBe('3');
  });

  test('lastSetsReplacementが別のindex宛てのときは、このカードの表示を巻き込んで変えない', () => {
    const before = makeExercise({
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
    });
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <RoutineTemplateExerciseCard exercise={before} index={0} isFirst={false} isLast={false} hasHistory={true} />,
      );
    });

    // このカード(index=0)ではなく別カード(index=1)宛てのreplacementなので、
    // 万一setsが変わっていなければ表示も変わらないことを確認する(通常起き得ないケースだが安全確認)
    mockLastSetsReplacement = { index: 1, token: 999 };
    act(() => {
      instance.update(
        <RoutineTemplateExerciseCard exercise={before} index={0} isFirst={false} isLast={false} hasHistory={true} />,
      );
    });

    const inputs = instance.root.findAllByType(TextInput);
    expect(inputs[0].props.value).toBe('60');
    expect(inputs[1].props.value).toBe('8');
  });
});

describe('focusFirstSet()（種目追加ピッカー・過去の記録から読み込む直後、app/routine/exercise-edit.tsxから呼ばれる）', () => {
  test('ref経由のfocusFirstSet()で先頭セットの最初の入力欄にだけフォーカスする', () => {
    const exercise = makeExercise({
      sets: [
        { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
        { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
      ],
    });
    const ref = React.createRef<RoutineTemplateExerciseCardHandle>();
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <RoutineTemplateExerciseCard ref={ref} exercise={exercise} index={0} isFirst={false} isLast={false} hasHistory={true} />,
      );
    });
    const inputs = instance.root.findAllByType(TextInput);
    const focusSpy = jest.spyOn(inputs[0].instance, 'focus');

    act(() => {
      ref.current!.focusFirstSet();
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
