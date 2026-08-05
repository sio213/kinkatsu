const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseWorkoutSession = jest.fn();
const mockUseSessionFinishCounts = jest.fn();
const mockUseSessionExercises = jest.fn();
const mockUseSessionSets = jest.fn();
const mockUseExercisesWithHistory = jest.fn();
const mockEndWorkoutSession = jest.fn();
const mockDeleteSession = jest.fn();
const mockDiscardSession = jest.fn();
const mockUseRoutines = jest.fn();
// 新規追加カードへのフォーカスはnavigation.addListener('transitionEnd', ...)を使うため
// （app/exercise/new.tsxと同じ方針）、useNavigationも最低限モックしておく必要がある
const mockAddListener = jest.fn().mockReturnValue(() => {});
// Stack.Screenに渡されたoptionsそのもの。headerLeftの有無のように、レンダー結果には
// 現れないナビゲーション設定を検証するために取っておく
let capturedOptions: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useNavigation: () => ({ addListener: mockAddListener }),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerTitle/headerRightの中身（タイトル・⋮メニュー）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown; headerRight?: () => unknown } }) => {
      const { createElement, Fragment } = require('react');
      capturedOptions = (options ?? {}) as Record<string, any>;
      return createElement(Fragment, null, options?.headerTitle?.(), options?.headerRight?.());
    },
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSession: (...args: unknown[]) => mockUseWorkoutSession(...args),
  useSessionFinishCounts: (...args: unknown[]) => mockUseSessionFinishCounts(...args),
  useSessionExercises: (...args: unknown[]) => mockUseSessionExercises(...args),
  useSessionSets: (...args: unknown[]) => mockUseSessionSets(...args),
  useExercisesWithHistory: (...args: unknown[]) => mockUseExercisesWithHistory(...args),
  EMPTY_SETS: [],
  EMPTY_PREFILLED_SET_IDS: [],
}));

jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  discardSession: (...args: unknown[]) => mockDiscardSession(...args),
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: (...args: unknown[]) => mockUseRoutines(...args),
}));

// SessionExerciseCard経由でreal @/db/clientまで読み込まれるのを防ぐ（expo-sqlite未モック環境で失敗するため）
jest.mock('@/lib/workout/sets', () => ({
  addSet: jest.fn(),
  deleteLastSet: jest.fn(),
  saveSet: jest.fn(),
  reopenSet: jest.fn(),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, FlatList, Text, TouchableOpacity } from 'react-native';
import WorkoutScreen from '@/app/workout/[id]';
import { SessionExerciseCard } from '@/components/workout/session-exercise-card';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

/** 直近のレンダーでStack.Screenに渡されたoptions。呼ぶ前にrender()すること */
function capturedScreenOptions() {
  render();
  return capturedOptions;
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(WorkoutScreen));
  });
  return instance.root;
}

// 実時刻(Date.now())にすると、CI等の遅い環境でモジュール読み込みからテスト実行までの
// 間に1秒以上経過し、経過時間表示が「0:00」でなくなりflakyになる。固定時刻に統一する
const FIXED_NOW = new Date(2026, 6, 5, 12, 0, 0).getTime();
const activeSession = { id: 1, startedAt: FIXED_NOW, endedAt: null };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  mockUseSessionExercises.mockReturnValue([]);
  mockUseSessionSets.mockReturnValue(new Map());
  mockUseExercisesWithHistory.mockReturnValue(new Set());
  mockEndWorkoutSession.mockResolvedValue(undefined);
  mockDeleteSession.mockResolvedValue(undefined);
  mockDiscardSession.mockResolvedValue(undefined);
  mockUseRoutines.mockReturnValue({ routines: [{ id: 1, name: 'ルーティンA' }] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

test('idが数値でない場合は「見つかりません」表示になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
});

test('セッションが見つからない場合、「戻る」を押すとrouter.backが呼ばれる', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: true });
  const root = render();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('セッションが見つかった場合、ネイティブヘッダーのタイマーを含む通常のトレーニング中画面を表示する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  // タイトル・戻るボタンはネイティブヘッダー（Stack.Screen options）が担うため、
  // ここではheaderRightに渡したタイマーが実際にレンダーされることだけを確認する
  expect(root.findByProps({ children: '0:00' })).toBeDefined();
  expect(findButtonByLabel(root, '種目を追加')).toBeDefined();
  expect(findButtonByLabel(root, 'トレーニングを終了')).toBeDefined();
});

test('1分経過するとタイマー表示が更新される', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  expect(root.findByProps({ children: '0:00' })).toBeDefined();

  act(() => {
    jest.advanceTimersByTime(60_000);
  });

  expect(root.findByProps({ children: '1:00' })).toBeDefined();
});

test('セッション終了後（endedAt有り）は合計時間を静的表示し、更新し続けない（過去の記録編集モード）', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  const root = render();

  const before = root.findByProps({ children: '0分' });
  expect(before).toBeDefined();

  act(() => {
    jest.advanceTimersByTime(60_000);
  });

  // intervalが張られていないので表示は変わらない
  expect(root.findByProps({ children: '0分' })).toBeDefined();
});

// カレンダー過去日パネル「記録を追加」で作成したセッション（2026-07-20）。startedAt===endedAtの
// ため所要時間の概念が無く、タイマーチップ自体を表示しない（常に「0分」になるのは実際に
// 0分で終えた通常セッションと見分けが付かず「バグに見える表示」になるため、@designer指摘）
test('過去日の事後記録セッション（startedAt===endedAt）ではタイマーチップ自体を表示しない', () => {
  const pastRecordSession = { id: 1, startedAt: FIXED_NOW, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: pastRecordSession, loaded: true });
  const root = render();

  expect(root.findAllByProps({ children: '0分' }).length).toBe(0);
  // タイマーチップ以外の「記録の編集」表示は普段通り
  expect(root.findByProps({ children: '記録の編集' })).toBeDefined();
});

function findMenuTrigger(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'トレーニングのメニューを開く');
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('⋮ボタンをタップするとメニューが開き、削除項目が表示される', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });

  expect(findMenuItem(root, '削除')).toBeDefined();
});

test('⋮メニューに「種目を追加」項目が「ルーティンから読み込み」より上に表示され、タップするとメニューを閉じ、画面下部のボタンと同じ種目追加ピッカーへ遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });

  const labels = root
    .findAllByType(TouchableOpacity)
    .map((t) => t.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string');
  expect(labels.indexOf('種目を追加')).toBeGreaterThanOrEqual(0);
  expect(labels.indexOf('種目を追加')).toBeLessThan(labels.indexOf('ルーティンから読み込み'));

  act(() => {
    findMenuItem(root, '種目を追加')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-picker',
    params: { sessionId: '1' },
  });
  expect(findMenuTrigger(root)!.props.accessibilityState).toEqual({ expanded: false });
});

test('種目が2件以上あるとき「種目を並び替え」を選択すると/workout/exercise-reorderへsessionId付きで遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 1, name: '種目1', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 10 },
    { id: 2, name: '種目2', category: 'back', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 11 },
  ]);
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  const reorderItem = findMenuItem(root, '種目を並び替え')!;
  expect(reorderItem.props.disabled).toBeFalsy();

  act(() => {
    reorderItem.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-reorder',
    params: { sessionId: '1' },
  });
});

test('種目が1件以下のとき「種目を並び替え」は無効化され、押しても遷移しない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 1, name: '種目1', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 10 },
  ]);
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  const reorderItem = findMenuItem(root, '種目を並び替え')!;
  expect(reorderItem.props.disabled).toBe(true);

  act(() => {
    reorderItem.props.onPress();
  });
  expect(mockPush).not.toHaveBeenCalled();
});

test('⋮メニューに「過去の記録から読み込み」項目が表示される（種目カードのメニューと同じ文言）', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });

  expect(findMenuItem(root, '過去の記録から読み込み')).toBeDefined();
});

test('「過去の記録から読み込み」をタップするとメニューを閉じ、過去のトレーニングを選ぶ画面へ遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, '過去の記録から読み込み')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/session-history-picker',
    params: { sessionId: '1' },
  });
  expect(findMenuTrigger(root)!.props.accessibilityState).toEqual({ expanded: false });
});

test('過去の記録編集モード（endedAt有り）でも「過去の記録から読み込み」項目が表示され、正しく遷移する', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  expect(findMenuItem(root, '過去の記録から読み込み')).toBeDefined();

  act(() => {
    findMenuItem(root, '過去の記録から読み込み')!.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/session-history-picker',
    params: { sessionId: '1' },
  });
});

test('⋮メニューに「ルーティンから読み込み」項目が「過去の記録から読み込み」より上に表示される', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });

  const labels = root
    .findAllByType(TouchableOpacity)
    .map((t) => t.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string');
  expect(labels.indexOf('ルーティンから読み込み')).toBeGreaterThanOrEqual(0);
  expect(labels.indexOf('ルーティンから読み込み')).toBeLessThan(labels.indexOf('過去の記録から読み込み'));
});

test('「ルーティンから読み込み」をタップするとメニューを閉じ、ルーティンを選ぶ画面へ遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, 'ルーティンから読み込み')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/routine-picker',
    params: { sessionId: '1' },
  });
  expect(findMenuTrigger(root)!.props.accessibilityState).toEqual({ expanded: false });
});

test('保存済みのルーティンが無いときは「ルーティンから読み込み」が無効化され、押しても遷移しない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseRoutines.mockReturnValue({ routines: [] });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  const routineItem = findMenuItem(root, 'ルーティンから読み込み')!;
  expect(routineItem.props.disabled).toBe(true);

  act(() => {
    routineItem.props.onPress();
  });
  expect(mockPush).not.toHaveBeenCalled();
});

test('過去の記録編集モード（endedAt有り）でも「種目を並び替え」が有効で、正しく遷移する', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 1, name: '種目1', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 10 },
    { id: 2, name: '種目2', category: 'back', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 11 },
  ]);
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  const reorderItem = findMenuItem(root, '種目を並び替え')!;
  expect(reorderItem.props.disabled).toBeFalsy();

  act(() => {
    reorderItem.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-reorder',
    params: { sessionId: '1' },
  });
});

test('「削除」をタップすると確認ダイアログを出し、確定するとdeleteSessionが呼ばれてrouter.backが呼ばれる', async () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '削除');
    confirmBtn?.onPress?.();
  });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  await act(async () => {
    findMenuItem(root, '削除')!.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'この記録を削除しますか？',
    '記録した種目・セットもすべて削除されます。',
    expect.anything(),
  );
  expect(mockDeleteSession).toHaveBeenCalledWith(1);
  expect(mockBack).toHaveBeenCalled();
});

test('削除確認をキャンセルするとdeleteSessionは呼ばれない', async () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  await act(async () => {
    findMenuItem(root, '削除')!.props.onPress();
  });

  expect(mockDeleteSession).not.toHaveBeenCalled();
});

test('記録の削除が失敗した場合はエラーAlertを表示する', async () => {
  mockDeleteSession.mockRejectedValue(new Error('fail'));
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '削除');
    confirmBtn?.onPress?.();
  });
  const root = render();

  act(() => {
    findMenuTrigger(root)!.props.onPress();
  });
  await act(async () => {
    await findMenuItem(root, '削除')!.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '記録を削除できませんでした。');
});

test('セッション終了後（endedAt有り）はヘッダーが「記録の編集」になり、「トレーニングを終了」ボタンは表示されない', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  const root = render();

  expect(root.findByProps({ children: '記録の編集' })).toBeDefined();
  expect(findButtonByLabel(root, 'トレーニングを終了')).toBeUndefined();
});

// app/calendar/schedule-workout-edit.tsxの「戻るのみ」フッターと同じ体験に揃える（@ユーザー指摘）
test('セッション終了後（endedAt有り）はフッターに「戻る」ボタンが表示され、押すとrouter.back()する', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  const root = render();

  const backBtn = findButtonByLabel(root, '戻る')!;
  expect(backBtn).toBeDefined();
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('進行中セッション（endedAt無し）ではフッターに「戻る」ボタンは表示されない（「トレーニングを終了」のみ）', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  expect(findButtonByLabel(root, '戻る')).toBeUndefined();
});

// 完了サマリーから開いても記録タブから開いても同じ画面。戻り先はスタックの下に居る画面が
// 決めるので、経路による出し分けを持たない（ヘッダーのシェブロンも既定のまま）
test('記録編集はどの経路から開かれてもフッターが「戻る」でヘッダーのシェブロンも既定のまま', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });

  expect(capturedScreenOptions().headerLeft).toBeUndefined();
  expect(findButtonByLabel(render(), '戻る')).toBeDefined();
});

test('値はあるが✓0件で終了を押すと確認ダイアログが出て、確定するとendWorkoutSessionが呼ばれる', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 2, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '終了する');
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'トレーニングを終了',
    '✓が付いたセットがありません。このまま終了しますか？',
    expect.anything(),
  );
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockReplace).toHaveBeenCalledWith('/workout/summary/1');
});

test('値はあるが✓0件で終了確認をキャンセルするとendWorkoutSessionは呼ばれない', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 2, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

// 値が1件も入っていないセッション（種目未追加／空行のまま／全セット削除）は終了ではなく破棄する。
// endWorkoutSessionで空の記録を履歴に残さないことがこのテストの主眼
test('値0件で終了を押すと破棄ダイアログが出て、確定するとdeleteSessionが呼ばれる', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '破棄する');
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'トレーニングを破棄',
    '記録がないため履歴に残りません。このトレーニングを破棄しますか？',
    expect.anything(),
  );
  expect(mockDiscardSession).toHaveBeenCalledWith(1);
  expect(mockDeleteSession).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalled();
});

test('値0件で破棄確認をキャンセルするとdiscardSessionは呼ばれない', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(mockDiscardSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

// 全欄が空のままでも✓は押せる（set-row.tsxのhandleTogglePress）。ユーザーが明示的に付けた
// ✓ごとセッションを消してしまわないよう、この組み合わせでは破棄せず終了させる
test('値0件でも✓が1件でもあれば破棄せず終了する', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 1, valuedSetCount: 0, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockDiscardSession).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
});

// 集計クエリが未解決の間は両カウントとも0になる。そのまま判定すると記録があるセッションを
// 破棄してしまうため、解決するまでは変更前と同じ「終了」確認に倒す
test('集計が未解決（loaded=false）のうちは0件でも破棄せず終了確認を出す', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: false });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'トレーニングを終了',
    '✓が付いたセットがありません。このまま終了しますか？',
    expect.anything(),
  );
  expect(mockDiscardSession).not.toHaveBeenCalled();
});

test('破棄確認ボタンを連打してもdiscardSession/router.backは1回しか呼ばれない', async () => {
  let resolveDiscard!: () => void;
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  mockDiscardSession.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveDiscard = resolve;
    }),
  );
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '破棄する');
    confirmBtn?.onPress?.();
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  act(() => {
    finishBtn.props.onPress();
  });

  expect(mockDiscardSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveDiscard();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('破棄が失敗した場合はエラーAlertが表示され、router.backは呼ばれない', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 0, valuedSetCount: 0, loaded: true });
  mockDiscardSession.mockRejectedValueOnce(new Error('fail'));
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '破棄する');
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを破棄できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('セットが1件以上ある場合は確認ダイアログを出さず即座に終了する', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 3, valuedSetCount: 3, loaded: true });
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockReplace).toHaveBeenCalledWith('/workout/summary/1');
});

test('連打してもendWorkoutSession/完了サマリーへの遷移は1回しか呼ばれない（二重終了の防止）', async () => {
  let resolveEnd!: () => void;
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 3, valuedSetCount: 3, loaded: true });
  mockEndWorkoutSession.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveEnd = resolve;
    }),
  );
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  act(() => {
    finishBtn.props.onPress();
    finishBtn.props.onPress();
  });

  expect(mockEndWorkoutSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveEnd();
  });
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

test('endWorkoutSessionが失敗した場合はエラーAlertが表示され、完了サマリーへ遷移しない', async () => {
  mockUseSessionFinishCounts.mockReturnValue({ completedSetCount: 3, valuedSetCount: 3, loaded: true });
  mockEndWorkoutSession.mockRejectedValueOnce(new Error('fail'));
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを終了できませんでした。');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('種目を追加ボタンを押すと種目追加ピッカーへ遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  const addBtn = findButtonByLabel(root, '種目を追加')!;
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-picker',
    params: { sessionId: '1' },
  });
});

test('種目が追加済みの場合は一覧表示になり、空状態は表示されない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 100 },
    { id: 11, name: 'スクワット', category: 'legs', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 101 },
  ]);
  const root = render();

  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
  expect(() => root.findByProps({ children: 'まだ種目がありません' })).toThrow();
  expect(findButtonByLabel(root, '種目を追加')).toBeDefined();
});

test('useSessionSetsの中身が正しいsessionExerciseIdのカードに渡る（同じ種目でもカードごとに独立）', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 100 },
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 101 },
  ]);
  mockUseSessionSets.mockReturnValue(
    new Map([[100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 }]]]),
  );
  const root = render();

  // 1枚目のカード(sessionExerciseId:100)には1件のセット行、2枚目(101)には対応するセットが無いので0件
  const checkboxes = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityRole === 'checkbox');
  expect(checkboxes).toHaveLength(1);
});

test('FlatListのkeyExtractorはexercise.idではなくsessionExerciseIdを使うため、同じ種目を複数回追加してもキーが衝突しない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 100 },
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 101 },
  ]);
  const root = render();

  const { keyExtractor, data } = root.findByType(FlatList).props;
  const keys = data.map((item: { sessionExerciseId: number }) => keyExtractor(item));

  expect(keys).toEqual(['100', '101']);
});

function findCheckbox(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityRole === 'checkbox' && t.props.accessibilityLabel === label)!;
}

describe('種目カードの折りたたみ', () => {
  const twoExercises = [
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 100 },
    { id: 11, name: 'スクワット', category: 'legs', measurementType: 'weight_reps', orderIndex: 1, sessionExerciseId: 101 },
  ];

  test('回帰: 全セット完了した種目は、別の種目カードに触れても自動では畳まれない（畳むとカードの高さが減った分だけ操作中の種目が画面上でずれ、入力中に見失うため撤去した）', async () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    let sets: Map<number, any[]> = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: null }]],
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    mockUseSessionSets.mockImplementation(() => sets);

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;

    // ベンチプレスの唯一のセットが完了する
    sets = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: Date.now() }]],
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    const findBenchCard = () =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(findBenchCard().props.collapsed).toBe(false);

    // スクワット側のセットに触れる（別の種目カードへの操作）
    await act(async () => {
      findCheckbox(root, 'スクワット セット1').props.onPress();
    });

    expect(findBenchCard().props.collapsed).toBe(false);
  });

  test('カードヘッダーのタップで、ユーザー自身のタイミングで畳める／開ける', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    mockUseSessionSets.mockReturnValue(
      new Map([
        [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: null }]],
        [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
      ]),
    );

    const root = render();
    const findBenchCard = () =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(findBenchCard().props.collapsed).toBe(false);

    act(() => {
      findBenchCard().props.onToggleCollapsed(100);
    });
    expect(findBenchCard().props.collapsed).toBe(true);

    act(() => {
      findBenchCard().props.onToggleCollapsed(100);
    });
    expect(findBenchCard().props.collapsed).toBe(false);
  });

  test('過去の記録編集モード（endedAt有り）では、全セット完了済みでも畳まれない', () => {
    const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
    mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    mockUseSessionSets.mockReturnValue(
      new Map([
        [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
        [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: FIXED_NOW }]],
      ]),
    );

    const root = render();

    const benchCard = root
      .findAllByType(SessionExerciseCard)
      .find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(benchCard.props.collapsed).toBe(false);
  });

  test('セッションを開いた時点で既に全セット完了済みの種目は、最初から畳まれた状態で表示される（中断したセッションの再開時に、終わった種目まで全部展開されていると見づらいため）', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    mockUseSessionSets.mockReturnValue(
      new Map([
        [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]], // 最初から完了済み
        [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
      ]),
    );

    const root = render();

    const collapsed = (id: number) =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === id)!.props
        .collapsed;
    expect(collapsed(100)).toBe(true);
    expect(collapsed(101)).toBe(false);
  });

  test('種目より1テンポ遅れてセットが届いた場合でも、初回の折りたたみ判定は行われる（種目だけ揃った時点で判定するとセット0件を未完了と誤判定してしまう）', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    // 1回目のレンダー時点ではセットのクエリがまだ解決していない
    let sets: Map<number, any[]> = new Map();
    mockUseSessionSets.mockImplementation(() => sets);

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;
    const findBenchCard = () =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(findBenchCard().props.collapsed).toBe(false);

    // 遅れてセットが届く（ベンチプレスは完了済み）
    sets = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    expect(findBenchCard().props.collapsed).toBe(true);
  });

  test('初回の折りたたみ判定は一度きりで、その後に別の種目が完了しても開閉状態は変わらない', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    let sets: Map<number, any[]> = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]], // 最初から完了済み
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    mockUseSessionSets.mockImplementation(() => sets);

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;

    // スクワットもこの場で完了させる
    sets = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: Date.now() }]],
    ]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    const collapsed = (id: number) =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === id)!.props
        .collapsed;
    expect(collapsed(100)).toBe(true); // 再開時に畳まれたまま
    expect(collapsed(101)).toBe(false); // 今完了させた種目は畳まれない
  });

  test('セットが未ロード（0件）の種目は、空配列の誤判定で完了扱いにならない', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    // sessionExerciseId:100 はまだsessionSetsにエントリが無い
    mockUseSessionSets.mockReturnValue(
      new Map([[101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]]]),
    );

    const root = render();

    const benchCard = root
      .findAllByType(SessionExerciseCard)
      .find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(benchCard.props.collapsed).toBe(false);
  });

  test('セットが種目より先に届いた場合でも、初回判定は種目が揃うまで待って正しく行われる', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    let exercises: typeof twoExercises = [];
    mockUseSessionExercises.mockImplementation(() => exercises);
    mockUseSessionSets.mockReturnValue(
      new Map([
        [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
        [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
      ]),
    );

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;
    expect(root.findAllByType(SessionExerciseCard)).toHaveLength(0);

    exercises = twoExercises;
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    const benchCard = root
      .findAllByType(SessionExerciseCard)
      .find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(benchCard.props.collapsed).toBe(true);
  });

  test('セッションのクエリが遅れて解決してisActiveがfalse→trueになった場合でも、初回判定が走る', () => {
    mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    mockUseSessionSets.mockReturnValue(
      new Map([
        [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
        [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
      ]),
    );

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;
    // セッションが未解決の間は画面自体がまだ何も描かない（isActive=falseで初回判定も走らない）
    expect(root.findAllByType(SessionExerciseCard)).toHaveLength(0);

    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    const benchCard = root
      .findAllByType(SessionExerciseCard)
      .find((c) => c.props.exercise.sessionExerciseId === 100)!;
    expect(benchCard.props.collapsed).toBe(true);
  });

  test('初回判定を待っている間にユーザーが手動で畳んだ種目は、判定が走った時点でも畳まれたまま保たれる', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue(twoExercises);
    // セットのクエリがまだ解決していない＝初回判定が保留されている状態
    let sets: Map<number, any[]> = new Map();
    mockUseSessionSets.mockImplementation(() => sets);

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;
    const collapsed = (id: number) =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === id)!.props
        .collapsed;

    // 判定を待っている間もカードは描画されており、ヘッダーはタップできる
    act(() => {
      root
        .findAllByType(SessionExerciseCard)
        .find((c) => c.props.exercise.sessionExerciseId === 101)!
        .props.onToggleCollapsed(101);
    });
    expect(collapsed(101)).toBe(true);

    // 遅れてセットが届き、初回判定が走る
    sets = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]],
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    expect(collapsed(100)).toBe(true); // 完了済みなので畳まれる
    expect(collapsed(101)).toBe(true); // 手動で畳んだ状態が上書きされていない
  });

  test('初回判定後に種目を追加しても、既存カードの状態は変わらず新しい種目も畳まれない', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    let exercises = twoExercises;
    mockUseSessionExercises.mockImplementation(() => exercises);
    let sets: Map<number, any[]> = new Map([
      [100, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: FIXED_NOW }]], // 最初から完了済み
      [101, [{ id: 2, setNumber: 1, weight: 80, reps: 5, completedAt: null }]],
    ]);
    mockUseSessionSets.mockImplementation(() => sets);

    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const root = instance.root;
    const collapsed = (id: number) =>
      root.findAllByType(SessionExerciseCard).find((c) => c.props.exercise.sessionExerciseId === id)!.props
        .collapsed;
    expect(collapsed(100)).toBe(true);

    // 完了済みの種目を追加で読み込む（過去の記録から読み込み等）
    exercises = [
      ...twoExercises,
      { id: 12, name: 'デッドリフト', category: 'back', measurementType: 'weight_reps', orderIndex: 2, sessionExerciseId: 102 },
    ];
    sets = new Map([
      ...sets,
      [102, [{ id: 3, setNumber: 1, weight: 100, reps: 3, completedAt: FIXED_NOW }]],
    ]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });

    expect(collapsed(100)).toBe(true); // 既存の状態は変わらない
    expect(collapsed(102)).toBe(false); // 後から増えた種目は完了済みでも畳まれない
  });
});

test('同じカードに複数回プリフィル/読み込みイベントが来た場合、最後のイベントのprefilledSetIdsが使われる（配列+findだと最初に見つかった古いidを参照してしまうバグの回帰防止）', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0, sessionExerciseId: 100 },
  ]);
  const root = render();

  act(() => {
    notifyPrefilled([{ sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [1, 2] }]);
  });
  act(() => {
    notifyPrefilled([{ sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'history', prefilledSetIds: [3, 4] }]);
  });

  const card = root
    .findAllByType(SessionExerciseCard)
    .find((c) => c.props.exercise.sessionExerciseId === 100)!;
  expect(card.props.prefilledSetIds).toEqual([3, 4]);
});

describe('種目追加後の頭出し', () => {
  const bench = {
    id: 10,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    orderIndex: 0,
    sessionExerciseId: 100,
  };
  const squat = {
    id: 20,
    name: 'スクワット',
    category: 'legs',
    measurementType: 'weight_reps',
    orderIndex: 1,
    sessionExerciseId: 101,
  };

  // 戻り遷移の完了（app/workout/[id].tsxはこれを待ってからフォーカスする）
  function fireTransitionEnd() {
    for (const [event, handler] of mockAddListener.mock.calls) {
      if (event === 'transitionEnd') (handler as (e: unknown) => void)({ data: { closing: false } });
    }
  }

  // 種目追加ピッカーはDBへ書き込んだ直後にpub/subで通知してrouter.back()する
  function addSquatAndReturn(instance: ReturnType<typeof create>) {
    act(() => {
      notifyPrefilled([
        { sessionId: 1, exerciseId: 20, sessionExerciseId: 101, kind: 'new', prefilledSetIds: [1] },
      ]);
    });
    mockUseSessionExercises.mockReturnValue([bench, squat]);
    act(() => {
      instance.update(React.createElement(WorkoutScreen));
    });
    act(() => {
      fireTransitionEnd();
    });
  }

  test('追加された種目カードの頭出しは、キーボードが出切ってから行う（フォーカスと同時に動かすとUIKitの自動スクロールとKeyboardAvoidingScreenの縮小に上書きされるため）', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue([bench]);
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const scrollToIndex = jest.spyOn(instance.root.findByType(FlatList).instance, 'scrollToIndex');

    addSquatAndReturn(instance);
    expect(scrollToIndex).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, viewPosition: 0, animated: true });
  });

  test('種目を追加していないときはスクロールしない（閲覧中に勝手に位置が動かない）', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue([bench, squat]);
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const scrollToIndex = jest.spyOn(instance.root.findByType(FlatList).instance, 'scrollToIndex');

    act(() => {
      fireTransitionEnd();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  test('スクロールの予約中に画面が閉じられてもスクロールしない（アンマウント後のFlatList操作を避ける）', () => {
    mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
    mockUseSessionExercises.mockReturnValue([bench]);
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(React.createElement(WorkoutScreen));
    });
    const scrollToIndex = jest.spyOn(instance.root.findByType(FlatList).instance, 'scrollToIndex');

    addSquatAndReturn(instance);
    act(() => {
      instance.unmount();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
