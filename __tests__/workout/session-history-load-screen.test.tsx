const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockAddHistoryCardsToSession = jest.fn();
const mockNotifyPrefilled = jest.fn();

jest.mock('expo-router', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? createElement(Text, null, options.title) : null,
    },
  };
});

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// history-picker-screen.test.tsxと同じ理由でdb/client等は最小限モックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({
  exercises: {},
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
  addHistoryCardsToSession: (...args: unknown[]) => mockAddHistoryCardsToSession(...args),
}));

jest.mock('@/lib/workout/prefill-feedback', () => ({
  notifyPrefilled: (...args: unknown[]) => mockNotifyPrefilled(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, Alert, Text, TouchableOpacity } from 'react-native';
import SessionHistoryLoadScreen from '@/app/workout/session-history-load';
import * as historyModule from '@/lib/workout/history';
import type { SessionHistoryCard } from '@/lib/workout/history';

const mockGetSessionExerciseCards = jest.spyOn(historyModule, 'getSessionExerciseCards');

const benchCard: SessionHistoryCard = {
  workoutSessionExerciseId: 500,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
  sets: [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};
const flyCard: SessionHistoryCard = {
  workoutSessionExerciseId: 501,
  exerciseId: 11,
  name: 'ダンベルフライ',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'dumbbell_fly',
  sets: [{ setNumber: 1, weight: 14, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};
const curlCard: SessionHistoryCard = {
  workoutSessionExerciseId: 502,
  exerciseId: 12,
  name: 'アームカール',
  category: 'arm',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'arm_curl',
  sets: [{ setNumber: 1, weight: 10, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === label);
}

function findSubmitButton(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) =>
      btn.findAllByType(Text).some((t) => typeof t.props.children === 'string' && t.props.children.endsWith('読み込む')),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SessionHistoryLoadScreen));
  });
  return instance.root;
}

async function renderResolved(cards: SessionHistoryCard[] | Error) {
  if (cards instanceof Error) {
    mockGetSessionExerciseCards.mockRejectedValue(cards);
  } else {
    mockGetSessionExerciseCards.mockResolvedValue(cards);
  }
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: '1',
    sourceSessionId: '99',
    sourceStartedAt: String(new Date(2026, 6, 3, 10, 0).getTime()),
  });
  mockAddHistoryCardsToSession.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('ヘッダーに選んだ過去セッションの日付を表示する', async () => {
  const root = await renderResolved([benchCard]);
  expect(root.findByProps({ children: '7月3日（金）' })).toBeDefined();
});

test('取得成功なら全種目が初期状態で選択済みになり、件数と「全選択」が表示される', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  expect(root.findByProps({ children: '読み込む種目 2/2' })).toBeDefined();
  const selectAll = findByLabel(root, '全選択')!;
  expect(selectAll.props.accessibilityState).toEqual({ checked: true });
});

test('初期状態は全選択のため送信ボタンは「すべて読み込む」', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
});

test('種目のチェックを外すと件数・ボタン文言が更新される', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  const flyRow = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
  act(() => {
    flyRow.props.onPress();
  });
  expect(root.findByProps({ children: '読み込む種目 1/2' })).toBeDefined();
  expect(root.findByProps({ children: '1種目を読み込む' })).toBeDefined();
});

test('全選択チェックを外すと全解除され、送信ボタンがdisabledになる', async () => {
  const root = await renderResolved([benchCard]);
  const selectAll = findByLabel(root, '全選択')!;
  act(() => {
    selectAll.props.onPress();
  });
  const submitBtn = findSubmitButton(root)!;
  expect(submitBtn.props.disabled).toBe(true);
});

test('一部だけ選択している状態で「全選択」を押すと全解除ではなく全選択になる', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  const flyRow = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
  act(() => {
    flyRow.props.onPress(); // 1/2選択状態にする
  });
  expect(root.findByProps({ children: '読み込む種目 1/2' })).toBeDefined();

  const selectAll = findByLabel(root, '全選択')!;
  act(() => {
    selectAll.props.onPress();
  });
  expect(root.findByProps({ children: '読み込む種目 2/2' })).toBeDefined();
  expect(selectAll.props.accessibilityState).toEqual({ checked: true });
});

test('中央の種目だけ選択解除しても、送信されるselectionsの並びは表示順(orderIndex順)を保つ', async () => {
  const root = await renderResolved([benchCard, flyCard, curlCard]);
  const flyRow = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
  act(() => {
    flyRow.props.onPress(); // 中央(fly)だけ解除 → bench, curlが残る
  });
  const submitBtn = findSubmitButton(root)!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockAddHistoryCardsToSession).toHaveBeenCalledWith(1, [
    { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
    { exerciseId: 12, sourceWorkoutSessionExerciseId: 502 },
  ]);
});

test('チェックを外して再度チェックしても、送信順はクリック順ではなく表示順のまま', async () => {
  const root = await renderResolved([benchCard, flyCard, curlCard]);
  const flyRow = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'))!;
  act(() => {
    flyRow.props.onPress(); // fly解除
  });
  act(() => {
    flyRow.props.onPress(); // fly再選択
  });
  const submitBtn = findSubmitButton(root)!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockAddHistoryCardsToSession).toHaveBeenCalledWith(1, [
    { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
    { exerciseId: 11, sourceWorkoutSessionExerciseId: 501 },
    { exerciseId: 12, sourceWorkoutSessionExerciseId: 502 },
  ]);
});

test('送信するとaddHistoryCardsToSessionに選択した種目を渡し、成功後にnotifyPrefilledしてdismiss(2)する', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  mockAddHistoryCardsToSession.mockResolvedValue([
    { sessionId: 1, exerciseId: 10, sessionExerciseId: 900, kind: 'history', prefilledSetIds: [] },
  ]);
  const submitBtn = findSubmitButton(root)!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockAddHistoryCardsToSession).toHaveBeenCalledWith(1, [
    { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
    { exerciseId: 11, sourceWorkoutSessionExerciseId: 501 },
  ]);
  expect(mockNotifyPrefilled).toHaveBeenCalledWith([
    { sessionId: 1, exerciseId: 10, sessionExerciseId: 900, kind: 'history', prefilledSetIds: [] },
  ]);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('notifyPrefilledはrouter.dismissより先に呼ばれる（コード上の呼び出し順を固定する）', async () => {
  const root = await renderResolved([benchCard]);
  const callOrder: string[] = [];
  mockNotifyPrefilled.mockImplementation(() => callOrder.push('notify'));
  mockDismiss.mockImplementation(() => callOrder.push('dismiss'));
  const submitBtn = findSubmitButton(root)!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(callOrder).toEqual(['notify', 'dismiss']);
});

test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
  const root = await renderResolved([benchCard]);
  mockAddHistoryCardsToSession.mockRejectedValueOnce(new Error('fail'));
  const submitBtn = findSubmitButton(root)!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を読み込めませんでした。');
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('連打してもaddHistoryCardsToSessionは1回しか呼ばれない', async () => {
  const root = await renderResolved([benchCard]);
  let resolveAdd!: (v: unknown[]) => void;
  mockAddHistoryCardsToSession.mockReturnValue(
    new Promise((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const submitBtn = findSubmitButton(root)!;
  act(() => {
    submitBtn.props.onPress();
    submitBtn.props.onPress();
  });
  expect(mockAddHistoryCardsToSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd([]);
  });
});

test('取得失敗時はエラーメッセージと再試行ボタンを表示する', async () => {
  const root = await renderResolved(new Error('fail'));
  expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();
});

test('取得失敗後に「再試行」ボタンを押すと再取得し、成功すれば通常表示に戻る', async () => {
  const root = await renderResolved(new Error('fail'));
  mockGetSessionExerciseCards.mockResolvedValueOnce([benchCard]);
  const retryBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '再試行')!;
  await act(async () => {
    retryBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
});

test('取得中はActivityIndicatorを表示し、ヘッダー・フッターは非表示', () => {
  mockGetSessionExerciseCards.mockReturnValue(new Promise(() => {}));
  const root = render();
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(() => root.findByProps({ children: 'すべて読み込む' })).toThrow();
});

test('sourceStartedAtが数値変換できない文字列でもクラッシュせず、一覧・送信は通常通り機能する', async () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: '1', sourceSessionId: '99', sourceStartedAt: 'abc' });
  const root = await renderResolved([benchCard]);
  expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
});

test('この日の記録が0件なら空状態のメッセージを表示し、戻るボタンでrouter.backする', async () => {
  const root = await renderResolved([]);
  expect(root.findByProps({ children: 'この日の記録がまだありません' })).toBeDefined();

  const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('sessionId/sourceSessionIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc', sourceSessionId: '99', sourceStartedAt: '0' });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
  expect(mockGetSessionExerciseCards).not.toHaveBeenCalled();
});
