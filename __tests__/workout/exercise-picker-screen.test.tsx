const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockAddExercisesToSession = jest.fn();
const mockUseExerciseUsageStats = jest.fn();
const mockCreateStartChooserSession = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // 実際のuseFocusEffectはナビゲーションのフォーカス/ブラーイベントに紐づくが、
  // テストではeffectを即実行するだけで十分（クリーンアップの検証はここでは不要）
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/hooks/use-exercise-usage-stats', () => ({
  useExerciseUsageStats: (...args: unknown[]) => mockUseExerciseUsageStats(...args),
}));

jest.mock('@/lib/workout/session', () => ({
  addExercisesToSession: (...args: unknown[]) => mockAddExercisesToSession(...args),
}));

jest.mock('@/lib/workout/start-chooser-session', () => ({
  createStartChooserSession: (...args: unknown[]) => mockCreateStartChooserSession(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import ExercisePickerScreen from '@/app/workout/exercise-picker';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';

const benchPress = { id: 10, name: 'ベンチプレス', category: 'chest', favorite: false, source: 'preset' };
const squat = { id: 11, name: 'スクワット', category: 'leg', favorite: false, source: 'preset' };
const benchPressLabel = 'ベンチプレス、胸';
const squatLabel = 'スクワット、脚';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExercisePickerScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ sessionId: '5' });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
  mockAddExercisesToSession.mockResolvedValue([]);
  mockCreateStartChooserSession.mockResolvedValue(42);
  mockUseExerciseUsageStats.mockReturnValue(new Map());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // zustandのstoreはモジュールシングルトンでテスト間を跨いで共有されるため、
  // 前のテストで選んだ並び替え軸が漏れないようデフォルトへ戻す
  useExerciseSortStore.setState({ listSortBy: 'category', pickerSortBy: 'frequent' });
});

test('初期状態は未選択で「追加」ボタンは無効', () => {
  const root = render();
  const addBtn = findButtonByLabel(root, '追加')!;
  expect(addBtn.props.disabled).toBe(true);
});

test('種目をタップすると選択され、ボタンラベルが件数付きに変わる', () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: benchPressLabel });
  act(() => {
    row.props.onPress();
  });

  expect(findButtonByLabel(root, '1件を追加')).toBeDefined();
});

test('選択済みの種目を再度タップすると解除され、0件で追加ボタンが再び無効化される', () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: benchPressLabel });

  act(() => {
    row.props.onPress();
  });
  expect(findButtonByLabel(root, '1件を追加')).toBeDefined();

  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '追加')!;
  expect(addBtn.props.disabled).toBe(true);
});

test('複数選択して追加を押すとaddExercisesToSessionが呼ばれ、router.backする', async () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    root.findByProps({ accessibilityLabel: squatLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '2件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(mockAddExercisesToSession).toHaveBeenCalledWith(5, [10, 11]);
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  // 通常経路（トレーニング画面から開く）は既存セッションに追加するだけで、新しく作らない
  expect(mockCreateStartChooserSession).not.toHaveBeenCalled();
});

// start-chooser「種目を追加」から直接この画面へ遷移してきた場合（2026-07-20）。
// この経路ではsessionIdが渡らず、セッションは「追加」を押した時点で初めて作られる
// （2026-07-25、@ユーザー指摘: 以前はstart-chooserのタップ直後に作っていたため、ここで
// 戻ると空の記録が残ってしまっていた）。/workout/{id}を一度もpushしていないため、
// router.back()ではなくdismiss(2)（start-chooser+この画面自身を閉じる）してからpushで
// /workout/{id}へ遷移する（2026-07-22、@ユーザー指摘: 元々はreplaceだったが、それだと
// start-chooserがスタックに残ったままになり、/workout/{id}側の「戻る」ボタンを押すと
// カレンダー/記録タブではなくstart-chooserに戻ってしまう不具合があった）
describe('newSession=1（start-chooserの「種目を追加」から直接遷移してきた場合）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ newSession: '1' });
  });

  test('画面を開いただけではセッションを作らない（戻っても空の記録が残らない）', () => {
    render();
    expect(mockCreateStartChooserSession).not.toHaveBeenCalled();
  });

  test('追加を押した時点でセッションを作り、そのidでaddExercisesToSession→dismiss(2)+pushする', async () => {
    const root = render();
    act(() => {
      root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    });

    const addBtn = findButtonByLabel(root, '1件を追加')!;
    await act(async () => {
      addBtn.props.onPress();
    });

    expect(mockCreateStartChooserSession).toHaveBeenCalledWith(undefined);
    expect(mockAddExercisesToSession).toHaveBeenCalledWith(42, [10]);
    expect(mockDismiss).toHaveBeenCalledWith(2);
    expect(mockPush).toHaveBeenCalledWith('/workout/42');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('pastDateKey付きならそのままcreateStartChooserSessionへ渡す（過去日の完了済みセッションを作るため）', async () => {
    mockUseLocalSearchParams.mockReturnValue({ newSession: '1', pastDateKey: '2026-07-25' });
    const root = render();
    act(() => {
      root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    });

    await act(async () => {
      findButtonByLabel(root, '1件を追加')!.props.onPress();
    });

    expect(mockCreateStartChooserSession).toHaveBeenCalledWith('2026-07-25');
  });

  test('セッション作成に失敗した場合はエラーAlertを表示し、種目追加も遷移も行わない', async () => {
    mockCreateStartChooserSession.mockRejectedValueOnce(new Error('fail'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const root = render();
    act(() => {
      root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    });

    await act(async () => {
      findButtonByLabel(root, '1件を追加')!.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
    expect(mockAddExercisesToSession).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('追加が失敗した場合はエラーAlertを表示し、dismiss/push/replace/backいずれも呼ばれない', async () => {
    mockAddExercisesToSession.mockRejectedValueOnce(new Error('fail'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const root = render();
    act(() => {
      root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    });

    const addBtn = findButtonByLabel(root, '1件を追加')!;
    await act(async () => {
      addBtn.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('まだセッションが無いためuseExerciseUsageStatsにはexcludeSessionIdを渡さない', () => {
    render();
    expect(mockUseExerciseUsageStats).toHaveBeenCalledWith(undefined);
  });
});

test('追加が失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockAddExercisesToSession.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('追加ボタンを連打してもaddExercisesToSessionは1回しか呼ばれない', async () => {
  let resolveAdd!: () => void;
  mockAddExercisesToSession.mockReturnValue(
    new Promise<unknown[]>((resolve) => {
      resolveAdd = () => resolve([]);
    }),
  );
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  act(() => {
    addBtn.props.onPress();
    addBtn.props.onPress();
  });

  expect(mockAddExercisesToSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('sessionIdが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc' });
  const root = render();

  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockAddExercisesToSession).not.toHaveBeenCalled();
});

test('既にセッションに追加済みの種目も候補一覧に出る（ウォームアップ→本セット等、同じ種目を複数回追加できる）', () => {
  // 種目追加ピッカーはセッションへの追加状況に関わらず全種目を候補にする
  // （重複防止は行わない。同じ種目を複数カードとして追加したいユースケースがあるため）
  const root = render();

  expect(root.findByProps({ accessibilityLabel: benchPressLabel })).toBeDefined();
  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
});

test('ⓘボタンを押すと種目詳細へ遷移する', () => {
  const root = render();
  const infoButtons = root
    .findAllByType(TouchableOpacity)
    .filter((btn: ReactTestInstance) => btn.props.accessibilityLabel === 'ベンチプレスの詳細を見る');
  expect(infoButtons.length).toBe(1);

  act(() => {
    infoButtons[0].props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/10');
});

test('検索するとカテゴリ・名前に一致しない種目は絞り込まれる', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('スクワット');
  });

  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();
});

test('検索語が無いときの空状態は「該当する種目がありません」', () => {
  mockUseExercises.mockReturnValue({ exercises: [] });
  const root = render();
  expect(root.findByProps({ children: '該当する種目がありません' })).toBeDefined();
});

test('検索語があるときの空状態は検索語を含むメッセージになる', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('存在しない種目');
  });

  expect(root.findByProps({ children: '「存在しない種目」は見つかりません' })).toBeDefined();
});

test('カテゴリチップで絞り込むと該当カテゴリ以外の種目は表示されない', () => {
  const root = render();
  const legChip = root.findByProps({ accessibilityLabel: '脚' });
  act(() => {
    legChip.props.onPress();
  });

  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();
});

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

function rowOrder(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .map((t) => t.props.accessibilityLabel as string)
    .filter((label) => label === benchPressLabel || label === squatLabel);
}

function findSortTrigger(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '));
}

test('並び替えドロップダウンが表示され、デフォルトは「よく使う順」', () => {
  const root = render();
  expect(findSortTrigger(root)!.props.accessibilityLabel).toBe('並び替え: よく使う順');
});

test('使用実績が無い種目しか無い場合、デフォルトの「よく使う順」でも名前順にフォールバックする', () => {
  // benchPress/squatともに一度も記録が無い（usageStatsが空）想定
  const root = render();
  expect(rowOrder(root)).toEqual([squatLabel, benchPressLabel]);
});

test('操作なしでも、実績データがあればデフォルトの「よく使う順」（recentUsageCount降順）で並ぶ', () => {
  mockUseExerciseUsageStats.mockReturnValue(
    new Map([
      [benchPress.id, { recentUsageCount: 1, lastUsedAt: 200 }],
      [squat.id, { recentUsageCount: 10, lastUsedAt: 100 }],
    ]),
  );
  const root = render();
  expect(rowOrder(root)).toEqual([squatLabel, benchPressLabel]);
});

test('種目タブとは独立した並び替え軸を持つ（種目タブのデフォルト=カテゴリ順の影響を受けない）', () => {
  useExerciseSortStore.getState().setListSortBy('name');
  const root = render();
  expect(findSortTrigger(root)!.props.accessibilityLabel).toBe('並び替え: よく使う順');
  // 逆方向（ピッカー側の変更が種目タブのlistSortByに影響しないこと）も併せて確認
  expect(useExerciseSortStore.getState().listSortBy).toBe('name');
});

test('並び替えを「最近使った順」に変更すると、frequentとは逆順（直近使った種目が上）に並び替わる', () => {
  // benchPress: recentUsageCountは多いがlastUsedAtは古い / squat: 逆
  // → frequent(デフォルト)ではbenchPressが上、recentに切り替えるとsquatが上になり、
  //   setPickerSortByが実際に呼ばれ並び替えに反映されていることを検証できる
  mockUseExerciseUsageStats.mockReturnValue(
    new Map([
      [benchPress.id, { recentUsageCount: 10, lastUsedAt: 100 }],
      [squat.id, { recentUsageCount: 1, lastUsedAt: 200 }],
    ]),
  );
  const root = render();
  expect(rowOrder(root)).toEqual([benchPressLabel, squatLabel]);

  act(() => {
    findSortTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, '最近使った順')!.props.onPress();
  });

  expect(findSortTrigger(root)!.props.accessibilityLabel).toBe('並び替え: 最近使った順');
  expect(rowOrder(root)).toEqual([squatLabel, benchPressLabel]);
});

test('useExerciseUsageStatsに進行中セッションのsessionIdをexcludeSessionIdとして渡す（自分自身を実績として参照しないため）', () => {
  render();
  expect(mockUseExerciseUsageStats).toHaveBeenCalledWith(5);
});

test('sessionIdが不正(NaN)なときは「見つかりません」画面になり、ExercisePickerView自体がマウントされないためuseExerciseUsageStatsも呼ばれない', () => {
  // exercise-picker-view.tsxへの切り出し後は、NotFoundState分岐でExercisePickerViewを
  // 描画しなくなった（以前はコンポーネント冒頭で無条件にフックを呼んでいたための副作用で、
  // 不正なsessionIdでも無駄にuseExerciseUsageStatsが呼ばれていた）。呼ばれないことの方が
  // 正しい挙動のため、この切り出しに合わせて期待値を更新する
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc' });
  render();
  expect(mockUseExerciseUsageStats).not.toHaveBeenCalled();
});
