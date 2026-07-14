const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseExercisesWithHistory = jest.fn();

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useExercisesWithHistory: (...args: unknown[]) => mockUseExercisesWithHistory(...args),
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// このスクリーンが使うNO_SESSION_TO_EXCLUDE(単なる定数)だけを差し替える
jest.mock('@/lib/workout/history', () => ({ NO_SESSION_TO_EXCLUDE: -1 }));

import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import RoutineExerciseEditScreen from '@/app/routine/exercise-edit';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';

function makeExercise(exerciseId: number): DraftExercise {
  return {
    exerciseId,
    name: `種目${exerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
  };
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineExerciseEditScreen));
  });
  return currentInstance!.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
  mockUseExercisesWithHistory.mockReturnValue(new Set());
  mockUseLocalSearchParams.mockReturnValue({});
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('ドラフトが空なら「種目を追加」の空状態が表示される', () => {
  const root = render();
  expect(root.findByProps({ accessibilityLabel: '種目を追加' })).toBeDefined();
});

test('ドラフトの全種目分のカードが表示される', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  expect(root.findByProps({ children: '種目1' })).toBeDefined();
  expect(root.findByProps({ children: '種目2' })).toBeDefined();
});

test('種目を追加ボタンを押すと/routine/exercise-pickerへ、この画面自身が起点であることが分かるreturnToパラメータ付きで遷移する', () => {
  const root = render();
  const addBtn = root.findByProps({ accessibilityLabel: '種目を追加' });

  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/routine/exercise-picker',
    params: { returnTo: 'exercise-edit' },
  });
});

test('保存を押すとrouter.backが呼ばれる（編集内容は既にドラフトストアへ反映済み）', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1)]);
  });
  const root = render();
  const saveBtn = findButtonByLabel(root, '保存')!;

  act(() => {
    saveBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('種目の⋮メニューから削除すると、ドラフトストアから即座に取り除かれ画面から消える', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  act(() => {
    useRoutineDraftStore.getState().removeExerciseAt(0);
  });

  expect(() => root.findByProps({ children: '種目1' })).toThrow();
  expect(root.findByProps({ children: '種目2' })).toBeDefined();
});

// 実ストアを使うテスト。RoutineTemplateExerciseCardの単体テスト(store全mock)では
// updateExerciseSetsへ渡す引数の正しさしか検証できず、削除後の実際の再レンダー結果までは
// 検証できない。行削除で配列位置がずれた際、行コンポーネントが古い表示値を持ち越さないことを
// ここで確認する(回帰テスト。かつてkey={setIndex}＋RoutineTemplateSetRowの表示stateが
// マウント時にしか初期化されない実装で、中間行削除後に別のセットの値が表示され続けるバグがあった)
function findMenuTriggers(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity).filter((t) => t.props.accessibilityLabel === 'メニューを開く');
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('先頭・末尾カードのisFirst/isLastが正しく渡り、それぞれ上へ移動/下へ移動が無効になる', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2), makeExercise(3)]);
  });
  const root = render();
  const triggers = findMenuTriggers(root);
  expect(triggers).toHaveLength(3);

  act(() => {
    triggers[0].props.onPress();
  });
  expect(findMenuItem(root, '上へ移動')!.props.disabled).toBe(true);
  expect(findMenuItem(root, '下へ移動')!.props.disabled).toBe(false);
});

test('useExercisesWithHistoryのSetに含まれる種目だけ「過去の記録から読み込む」が有効になる', () => {
  mockUseExercisesWithHistory.mockReturnValue(new Set([1]));
  act(() => {
    useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
  });
  const root = render();

  // 両方のカードのメニューを開いてから、ツリー内の出現順(=カードの並び順)で判定する。
  // 1件ずつ開いて都度findMenuItemで探すと、閉じずに次を開いた場合に同名ラベルが複数存在し
  // どちらのカードの項目か曖昧になるため
  const triggers = findMenuTriggers(root);
  act(() => {
    triggers[0].props.onPress();
  });
  act(() => {
    triggers[1].props.onPress();
  });

  const items = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityLabel === '過去の記録から読み込む');
  expect(items).toHaveLength(2);
  expect(items[0].props.disabled).toBe(false); // exerciseId=1はSetに含まれる
  expect(items[1].props.disabled).toBe(true); // exerciseId=2はSetに含まれない
});

test('中間のセットを行✕で削除すると、残りの行は正しい値を表示する（表示の取り違えがない）', () => {
  act(() => {
    useRoutineDraftStore.getState().addExercises([
      {
        ...makeExercise(1),
        sets: [
          { weight: 10, reps: 1, durationSeconds: null, distanceMeters: null },
          { weight: 20, reps: 2, durationSeconds: null, distanceMeters: null },
          { weight: 30, reps: 3, durationSeconds: null, distanceMeters: null },
        ],
      },
    ]);
  });
  const root = render();

  const rowDeleteBtn = root.findByProps({ accessibilityLabel: '種目1 セット2を削除' });
  act(() => {
    rowDeleteBtn.props.onPress();
  });

  const inputs = root.findAllByType(TextInput);
  expect(inputs.map((i) => i.props.value)).toEqual(['10', '1', '30', '3']);
});

describe('focusIndexパラメータによる自動スクロール(ルーティンフォームの種目一覧からのタップ元種目まで頭出しする)', () => {
  test('focusIndexで指定した種目カードの位置までscrollToが呼ばれる(listのY + 該当カードのY - contentのpaddingTop)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2), makeExercise(3)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 240 } } });
    });

    // contentのpaddingTop(12)を差し引き、通常スクロール時と同じ見た目のリズムに揃える
    expect(scrollTo).toHaveBeenCalledWith({ y: 12 + 240 - 12, animated: false });
  });

  test('list・対象カードいずれかのonLayoutがまだ来ていない間はscrollToを呼ばない', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    // listのonLayoutだけ先に発火し、対象カードの位置がまだ分からない状態
    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('focusIndex未指定(通常の「保存」ボタン経由等の遷移)ではscrollToを呼ばない', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 240 } } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('onLayoutの発火順序が逆(item→list)でも、両方揃った時点で正しい合計値でscrollToが呼ばれる(親子のonLayout発火順は保証されないため)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 240 } } });
    });
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });

    expect(scrollTo).toHaveBeenCalledWith({ y: 12 + 240 - 12, animated: false });
  });

  test('一度スクロールした後にonLayoutが再発火しても、scrollToは再度呼ばれない(二重ジャンプ防止の一度きり制御)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 240 } } });
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    // キーボード表示等で再レイアウトが起き、座標が変わって再度onLayoutが発火したケースを模す
    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 40 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 260 } } });
    });

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test('focusIndexが種目数の範囲外(削除・並び替えでズレた場合を想定)の場合はscrollToを呼ばない', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '5' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2), makeExercise(3)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      [0, 1, 2].forEach((i) =>
        root.findByProps({ testID: `exercise-item-${i}` }).props.onLayout({ nativeEvent: { layout: { y: i * 100 } } }),
      );
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('focusIndexが数値変換できない文字列の場合はscrollToを呼ばない(NaN安全)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: 'abc' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 240 } } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('focusIndex=0(先頭)でも正しくスクロールする(境界値)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '0' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });

    // 差し引いた結果が負値にならないようクランプされ0になる
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });

  test('listのpaddingTop差し引きで負値になる場合は0にクランプされる', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '0' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 5 } } });
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });

    // 5 + 0 - 12 = -7 だが負値にはならない
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });

  test('フォーカス対象のカードは折りたたまれていない状態(展開済み)で表示される', () => {
    // RoutineTemplateExerciseCardのcollapsedは常にコンポーネントローカルのuseState(false)
    // (=展開)から始まるため現状崩れる余地は無いが、将来collapsed状態がストア等で永続化される
    // ように変わった際、フォーカス対象が折りたたまれたまま出現する回帰を検知するためのテスト
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(1), makeExercise(2)]);
    });
    const root = render();

    const cardBodies = root.findAllByProps({ testID: 'card-body' });
    const focusedBody = cardBodies[1];
    const flatStyle = Object.assign({}, ...focusedBody.props.style.filter(Boolean));
    expect(flatStyle.display).not.toBe('none');
  });
});
