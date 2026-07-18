const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercise = jest.fn();
const mockLoadHistoryIntoSessionExercise = jest.fn();
const mockNotifyPrefilled = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercise: (...args: unknown[]) => mockUseExercise(...args),
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// computePersonalBestIds（pure関数）は実物を使いつつgetExerciseHistoryEntriesだけ
// spyOnで差し替える（history.test.tsと同じ理由でdb/client等は最小限モックする）
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({
  sets: {},
  workoutSessionExercises: {},
  workoutSessions: {},
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
  ne: jest.fn(),
}));

jest.mock('@/lib/workout/session', () => ({
  loadHistoryIntoSessionExercise: (...args: unknown[]) => mockLoadHistoryIntoSessionExercise(...args),
}));

jest.mock('@/lib/workout/prefill-feedback', () => ({
  notifyPrefilled: (...args: unknown[]) => mockNotifyPrefilled(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import HistoryPickerScreen from '@/app/workout/history-picker';
import * as historyModule from '@/lib/workout/history';
import type { HistoryEntry } from '@/lib/workout/history';

const mockGetExerciseHistoryEntries = jest.spyOn(historyModule, 'getExerciseHistoryEntries');

const entry1 = {
  workoutSessionExerciseId: 100,
  sessionId: 1,
  startedAt: new Date('2026-07-01T10:00:00').getTime(),
  sets: [
    { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 },
    { setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 },
  ],
};
const entry2 = {
  workoutSessionExerciseId: 101,
  sessionId: 2,
  startedAt: new Date('2026-06-01T10:00:00').getTime(),
  sets: [{ setNumber: 1, weight: 80, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};

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
    instance = create(React.createElement(HistoryPickerScreen));
  });
  return instance.root;
}

async function renderResolved(entries: HistoryEntry[] | Error) {
  if (entries instanceof Error) {
    mockGetExerciseHistoryEntries.mockRejectedValue(entries);
  } else {
    mockGetExerciseHistoryEntries.mockResolvedValue(entries);
  }
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

// formatRelativeDaysAgoは相対日付を返すため実時刻(Date.now())だとテスト実行日によって
// 表示が変わりflakyになる。entry1(7/1)の2日後に固定する（workout-screen.test.tsxと同じ対応）
const FIXED_NOW = new Date(2026, 6, 3, 12, 0, 0).getTime();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: '1',
    sessionExerciseId: '500',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  mockUseExercise.mockReturnValue({ exercise: { id: 10, name: 'ベンチプレス', measurementType: 'weight_reps' } });
  mockLoadHistoryIntoSessionExercise.mockResolvedValue({ prefilledSetIds: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

test('種目名がヘッダーのサブタイトルに表示される', async () => {
  const root = await renderResolved([entry1]);
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
});

test('取得成功かつ1件以上あれば注意バナーを表示する', async () => {
  const root = await renderResolved([entry1]);
  expect(root.findByProps({ children: '過去の記録から読み込み' })).toBeDefined();
  expect(() => root.findByProps({ children: 'この種目の過去の記録がまだありません' })).toThrow();
});

test('取得失敗時はエラーメッセージと再試行ボタンを表示し、押すと再取得する', async () => {
  const root = await renderResolved(new Error('fail'));
  expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();

  mockGetExerciseHistoryEntries.mockResolvedValue([entry1]);
  const retryBtn = findButtonByLabel(root, '再試行')!;
  await act(async () => {
    retryBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(() => root.findByProps({ children: '記録を読み込めませんでした' })).toThrow();
});

test('過去の記録が0件なら空状態のメッセージを表示し、戻るボタンでrouter.backする', async () => {
  const root = await renderResolved([]);
  expect(root.findByProps({ children: 'この種目の過去の記録がまだありません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('自己ベストのカードにだけ「自己ベスト」バッジが付く', async () => {
  const root = await renderResolved([entry1, entry2]);
  // entry1: 60kg最大, entry2: 80kg最大 -> entry2が自己ベスト
  expect(
    root.findByProps({ accessible: true, accessibilityLabel: '7月1日（水）、2日前、60kg×10・60kg×8' }),
  ).toBeDefined();
  expect(
    root.findByProps({ accessible: true, accessibilityLabel: '6月1日（月）、1ヶ月前、自己ベスト、80kg×5' }),
  ).toBeDefined();
});

test('hasRecordedDataがfalseなら確認なしですぐ読み込み、prefilledをnotifyしてrouter.backする', async () => {
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  await act(async () => {
    loadBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockLoadHistoryIntoSessionExercise).toHaveBeenCalledWith(500, 100);
  expect(mockNotifyPrefilled).toHaveBeenCalledWith([
    { sessionId: 1, exerciseId: 10, sessionExerciseId: 500, kind: 'history', prefilledSetIds: [] },
  ]);
  expect(mockBack).toHaveBeenCalled();
});

test('hasRecordedDataがtrueなら日付を含む確認ダイアログを出し、確定すると読み込む', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: '1',
    sessionExerciseId: '500',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '読み込む');
    confirmBtn?.onPress?.();
  });
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  await act(async () => {
    loadBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    '7月1日（水）の記録を読み込みますか？',
    '入力済みの記録は失われます。',
    expect.anything(),
  );
  expect(mockLoadHistoryIntoSessionExercise).toHaveBeenCalledWith(500, 100);
  expect(mockBack).toHaveBeenCalled();
});

test('確認をキャンセルするとloadHistoryIntoSessionExerciseは呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: '1',
    sessionExerciseId: '500',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  await act(async () => {
    loadBtn.props.onPress();
  });

  expect(mockLoadHistoryIntoSessionExercise).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('読み込みが失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockLoadHistoryIntoSessionExercise.mockRejectedValueOnce(new Error('fail'));
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  await act(async () => {
    loadBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '記録を読み込めませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('連打してもloadHistoryIntoSessionExerciseは1回しか呼ばれない', async () => {
  let resolveLoad!: (v: { prefilledSetIds: number[] }) => void;
  mockLoadHistoryIntoSessionExercise.mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  );
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
    loadBtn.props.onPress();
  });

  expect(mockLoadHistoryIntoSessionExercise).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveLoad({ prefilledSetIds: [] });
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('sessionId/sessionExerciseId/exerciseIdが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: 'abc',
    sessionExerciseId: '500',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();

  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockGetExerciseHistoryEntries).not.toHaveBeenCalled();
});
