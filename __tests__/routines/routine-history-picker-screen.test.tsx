const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercise = jest.fn();
const mockLoadSetsIntoExerciseAt = jest.fn();

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
// spyOnで差し替える(workout側history-picker-screen.test.tsxと同じ理由)
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

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: { loadSetsIntoExerciseAt: (...args: unknown[]) => void }) => unknown) =>
    selector({ loadSetsIntoExerciseAt: mockLoadSetsIntoExerciseAt }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import RoutineHistoryPickerScreen from '@/app/routine/history-picker';
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
    instance = create(React.createElement(RoutineHistoryPickerScreen));
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

const FIXED_NOW = new Date(2026, 6, 3, 12, 0, 0).getTime();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  mockUseExercise.mockReturnValue({ exercise: { id: 10, name: 'ベンチプレス', measurementType: 'weight_reps' } });
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

test('getExerciseHistoryEntriesには「除外セッション無し」を意味する番兵値(-1)を渡す(ルーティンには進行中セッションが無いため)', async () => {
  await renderResolved([entry1]);
  expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(10, -1);
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
  expect(
    root.findByProps({ accessible: true, accessibilityLabel: '7月1日（水）、2日前、60kg×10・60kg×8' }),
  ).toBeDefined();
  expect(
    root.findByProps({ accessible: true, accessibilityLabel: '6月1日（月）、1ヶ月前、自己ベスト、80kg×5' }),
  ).toBeDefined();
});

test('hasRecordedDataがfalseなら確認なしですぐloadSetsIntoExerciseAtが呼ばれ、router.backする', async () => {
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockLoadSetsIntoExerciseAt).toHaveBeenCalledWith(2, [
    { weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
    { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
  ]);
  expect(mockBack).toHaveBeenCalled();
});

test('値が1つも無い行(セット追加だけして未入力のまま終えた等)は読み込み時に除外される(getExerciseHistoryEntriesは行単位までは絞り込まないため)', async () => {
  const entryWithEmptyRow = {
    workoutSessionExerciseId: 100,
    sessionId: 1,
    startedAt: new Date('2026-07-01T10:00:00').getTime(),
    sets: [
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null, completedAt: null },
    ],
  };
  const root = await renderResolved([entryWithEmptyRow]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
  });

  expect(mockLoadSetsIntoExerciseAt).toHaveBeenCalledWith(2, [
    { weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
  ]);
});

test('hasRecordedDataがtrueなら日付を含む確認ダイアログを出し、確定すると読み込む', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
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
  act(() => {
    loadBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    '7月1日（水）の記録を読み込みますか？',
    '設定済みのセット内容は失われます。',
    expect.anything(),
  );
  expect(mockLoadSetsIntoExerciseAt).toHaveBeenCalledWith(2, expect.any(Array));
  expect(mockBack).toHaveBeenCalled();
});

test('確認をキャンセルするとloadSetsIntoExerciseAtは呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
  });

  expect(mockLoadSetsIntoExerciseAt).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('連打してもloadSetsIntoExerciseAtは1回しか呼ばれない', async () => {
  const root = await renderResolved([entry1]);
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
    loadBtn.props.onPress();
  });

  expect(mockLoadSetsIntoExerciseAt).toHaveBeenCalledTimes(1);
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('indexまたはexerciseIdが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: 'abc',
    exerciseId: '10',
    exerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();

  expect(root.findByProps({ children: '種目が見つかりません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockGetExerciseHistoryEntries).not.toHaveBeenCalled();
});
