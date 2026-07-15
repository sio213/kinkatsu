const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseExercisesWithHistory = jest.fn();
// 実装ではaddListenerの戻り値(登録解除関数)は使うが、ここでは呼び出し記録だけできれば十分
const mockAddListener = jest.fn().mockReturnValue(() => {});

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useNavigation: () => ({ addListener: mockAddListener }),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（⋮ボタン）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
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

// この画面自身の遷移(ルーティンフォームからのpush/replace、種目追加ピッカー等からのpop/dismiss)が
// 完了したことを表すtransitionEndを疑似発火する。closing=falseは「自分が表示された側」を表す
// (app/workout/[id].tsxのnavigation.addListener('transitionEnd', ...)と同じイベント形)。
// tryFocusAddedの参照はlastAddedAtが変わるたびに新しくなり、そのたびにuseEffectが登録し直す
// ため、直近(最後)に登録されたリスナーを使う
function fireTransitionEnd(closing = false) {
  const calls = mockAddListener.mock.calls.filter(([eventName]) => eventName === 'transitionEnd');
  const listener = calls[calls.length - 1]?.[1];
  act(() => {
    listener?.({ data: { closing } });
  });
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
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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

test('戻るを押すとrouter.backが呼ばれる（編集内容は既にドラフトストアへ反映済み）', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
  });
  const root = render();
  const backBtn = findButtonByLabel(root, '戻る')!;

  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('種目の⋮メニューから削除すると、ドラフトストアから即座に取り除かれ画面から消える', () => {
  act(() => {
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
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
    useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
    useRoutineDraftStore.getState().hydrate([
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

describe('ヘッダー⋮メニュー: 種目を並び替え', () => {
  test('種目が2件以上あるとき、選択すると/routine/exercise-reorderへ遷移する', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const menuBtn = root
      .findAllByType(TouchableOpacity)
      .find((btn: ReactTestInstance) => btn.props.accessibilityLabel === '種目編集のメニューを開く')!;

    act(() => {
      menuBtn.props.onPress();
    });
    const reorderBtn = findButtonByLabel(root, '種目を並び替え')!;
    act(() => {
      reorderBtn.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/routine/exercise-reorder');
  });

  test('種目が1件以下のときは無効化され、押しても遷移しない(並び替える対象が無いため)', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    const menuBtn = root
      .findAllByType(TouchableOpacity)
      .find((btn: ReactTestInstance) => btn.props.accessibilityLabel === '種目編集のメニューを開く')!;

    act(() => {
      menuBtn.props.onPress();
    });
    const reorderBtn = findButtonByLabel(root, '種目を並び替え')!;
    expect(reorderBtn.props.disabled).toBe(true);

    act(() => {
      reorderBtn.props.onPress();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('種目が0件のときも無効化される', () => {
    const root = render();
    const menuBtn = root
      .findAllByType(TouchableOpacity)
      .find((btn: ReactTestInstance) => btn.props.accessibilityLabel === '種目編集のメニューを開く')!;

    act(() => {
      menuBtn.props.onPress();
    });
    const reorderBtn = findButtonByLabel(root, '種目を並び替え')!;
    expect(reorderBtn.props.disabled).toBe(true);
  });
});

describe('ヘッダー⋮メニュー: 過去の記録から読み込む', () => {
  test('選択すると/routine/session-history-pickerへ遷移する(件数によらず常に有効)', () => {
    const root = render();
    const menuBtn = root
      .findAllByType(TouchableOpacity)
      .find((btn: ReactTestInstance) => btn.props.accessibilityLabel === '種目編集のメニューを開く')!;

    act(() => {
      menuBtn.props.onPress();
    });
    const historyBtn = findButtonByLabel(root, '過去の記録から読み込む')!;
    expect(historyBtn.props.disabled).toBeFalsy();

    act(() => {
      historyBtn.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/routine/session-history-picker');
  });
});

describe('種目追加後の自動スクロール・自動フォーカス(過去の記録から読み込む・種目を追加ピッカーから戻った直後、追加された最初のカードまでスクロールし最初のセットの入力欄にフォーカスする。トレーニング中画面のcardRefsRef/focusFirstSetと同じ考え方)', () => {
  test('addExercisesで種目が追加されると、追加された最初のカードの位置までscrollToが呼ばれる', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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

    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(3)]);
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-2' }).props.onLayout({ nativeEvent: { layout: { y: 480 } } });
    });

    // listY(12) + itemY(480) - contentのpaddingTop(12) = 480
    expect(scrollTo).toHaveBeenCalledWith({ y: 480, animated: true });
  });

  test('画面遷移(transitionEnd)完了後であれば、追加された最初のカードの最初のセット入力欄にフォーカスする', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    fireTransitionEnd();

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });

    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(2)]);
    });

    const newCardInputs = root
      .findByProps({ testID: 'exercise-item-1' })
      .findAllByType(TextInput);
    const focusSpy = jest.spyOn(newCardInputs[0].instance, 'focus');

    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 100 } } });
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  test('画面遷移(transitionEnd)が完了する前は、レイアウトが揃っていてもフォーカスしない(遷移アニメ中にキーボードが被さるジャンクを防ぐ)', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    // transitionEndをまだ発火しない(遷移アニメーションがまだ終わっていない想定)

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });
    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(2)]);
    });

    const newCardInputs = root.findByProps({ testID: 'exercise-item-1' }).findAllByType(TextInput);
    const focusSpy = jest.spyOn(newCardInputs[0].instance, 'focus');

    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 100 } } });
    });
    expect(focusSpy).not.toHaveBeenCalled();

    // 遷移が完了した時点で、取りこぼさず改めてフォーカスする
    fireTransitionEnd();
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  test('過去の記録から読み込む等で複数の種目が一度に追加された場合は、キーボードを自動で開かない(スクロールのみ行う)', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    fireTransitionEnd();

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });

    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(2), makeExercise(3)]);
    });

    const newCardInputs = root.findByProps({ testID: 'exercise-item-1' }).findAllByType(TextInput);
    const focusSpy = jest.spyOn(newCardInputs[0].instance, 'focus');
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 100 } } });
    });

    expect(scrollTo).toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  test('同じ画面インスタンス内で複数回追加されても、その都度スクロールする(一度きりのフラグではない)', () => {
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      root.findByProps({ testID: 'exercise-item-0' }).props.onLayout({ nativeEvent: { layout: { y: 0 } } });
    });

    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(2)]);
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-1' }).props.onLayout({ nativeEvent: { layout: { y: 100 } } });
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    act(() => {
      useRoutineDraftStore.getState().addExercises([makeExercise(3)]);
    });
    act(() => {
      root.findByProps({ testID: 'exercise-item-2' }).props.onLayout({ nativeEvent: { layout: { y: 200 } } });
    });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  test('別のルーティンをhydrateすると前の編集セッションのlastAddedAtは消え、focusIndex指定の新しい画面で誤ってスクロール先が上書きされない(回帰防止)', () => {
    // ルーティンAを編集中に種目を追加し、lastAddedAtが残った状態を作る
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
      useRoutineDraftStore.getState().addExercises([makeExercise(3)]);
    });

    // 保存せずルーティン一覧へ戻り、別のルーティンBの編集を開始した想定(hydrateが呼ばれる)
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(10), makeExercise(20), makeExercise(30)]);
    });

    // ルーティンBの種目一覧で2番目のカードをタップして開いた想定(focusIndex='1')
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });
    act(() => {
      [0, 1, 2].forEach((i) =>
        root
          .findByProps({ testID: `exercise-item-${i}` })
          .props.onLayout({ nativeEvent: { layout: { y: i * 100 } } }),
      );
    });

    // focusIndex=1(y=100)の位置に一度だけスクロールし、ルーティンAで残っていたlastAddedAt.index=2
    // (y=200)へは飛ばない
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 100, animated: false });
  });
});

describe('focusIndexパラメータによる自動スクロール(ルーティンフォームの種目一覧からのタップ元種目まで頭出しする)', () => {
  test('focusIndexで指定した種目カードの位置までscrollToが呼ばれる(listのY + 該当カードのY - contentのpaddingTop)', () => {
    mockUseLocalSearchParams.mockReturnValue({ focusIndex: '1' });
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
    });
    const root = render();
    const scrollTo = jest.spyOn(root.findByType(ScrollView).instance, 'scrollTo');

    // listのonLayoutだけ先に発火し、対象カードの位置がまだ分からない状態
    act(() => {
      root.findByProps({ testID: 'exercise-list' }).props.onLayout({ nativeEvent: { layout: { y: 12 } } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('focusIndex未指定(通常の「戻る」ボタン経由等の遷移)ではscrollToを呼ばない', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    act(() => {
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2), makeExercise(3)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1)]);
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
      useRoutineDraftStore.getState().hydrate([makeExercise(1), makeExercise(2)]);
    });
    const root = render();

    const cardBodies = root.findAllByProps({ testID: 'card-body' });
    const focusedBody = cardBodies[1];
    const flatStyle = Object.assign({}, ...focusedBody.props.style.filter(Boolean));
    expect(flatStyle.display).not.toBe('none');
  });
});
