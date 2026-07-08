const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

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

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import SessionHistoryPickerScreen from '@/app/workout/session-history-picker';
import * as historyModule from '@/lib/workout/history';
import type { PastTrainingSession } from '@/lib/workout/history';

const mockGetPastTrainingSessions = jest.spyOn(historyModule, 'getPastTrainingSessions');

const chestSession: PastTrainingSession = {
  sessionId: 1,
  startedAt: new Date(2026, 6, 5, 10, 0).getTime(),
  exercises: [
    { exerciseId: 10, name: 'ベンチプレス', category: 'chest' },
    { exerciseId: 11, name: 'ダンベルフライ', category: 'chest' },
  ],
};
const legSession: PastTrainingSession = {
  sessionId: 2,
  startedAt: new Date(2026, 5, 28, 10, 0).getTime(),
  exercises: [{ exerciseId: 20, name: 'スクワット', category: 'leg' }],
};

function findChipByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.props.accessibilityLabel === label && btn.props.accessibilityRole === 'radio');
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SessionHistoryPickerScreen));
  });
  return instance.root;
}

async function renderResolved(sessions: PastTrainingSession[] | Error) {
  if (sessions instanceof Error) {
    mockGetPastTrainingSessions.mockRejectedValue(sessions);
  } else {
    mockGetPastTrainingSessions.mockResolvedValue(sessions);
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
  mockUseLocalSearchParams.mockReturnValue({ sessionId: '99' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('取得成功なら過去のセッションをカードで一覧表示する', async () => {
  const root = await renderResolved([chestSession, legSession]);
  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
});

test('取得失敗時はエラーメッセージと再試行ボタンを表示し、押すと再取得する', async () => {
  const root = await renderResolved(new Error('fail'));
  expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();

  mockGetPastTrainingSessions.mockResolvedValue([chestSession]);
  const retryBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.props.accessibilityLabel === '再試行')!;
  await act(async () => {
    retryBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
});

test('過去のトレーニング記録が0件なら空状態のメッセージを表示し、戻るボタンでrouter.backする', async () => {
  const root = await renderResolved([]);
  expect(root.findByProps({ children: '過去のトレーニング記録がまだありません' })).toBeDefined();

  const backBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('カテゴリチップは実際にデータに含まれるカテゴリのみを表示する（★お気に入りは含まない）', async () => {
  const root = await renderResolved([chestSession, legSession]);
  expect(findChipByLabel(root, '全て')).toBeDefined();
  expect(findChipByLabel(root, '胸')).toBeDefined();
  expect(findChipByLabel(root, '脚')).toBeDefined();
  expect(findChipByLabel(root, '★')).toBeUndefined();
  expect(findChipByLabel(root, '背中')).toBeUndefined();
});

test('カテゴリチップで絞り込むと該当するセッションだけが表示される', async () => {
  const root = await renderResolved([chestSession, legSession]);
  const legChip = findChipByLabel(root, '脚')!;
  act(() => {
    legChip.props.onPress();
  });

  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
  expect(() => root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toThrow();
});


test('「全て」チップに戻すと絞り込みが解除され全件表示される', async () => {
  const root = await renderResolved([chestSession, legSession]);
  const legChip = findChipByLabel(root, '脚')!;
  act(() => {
    legChip.props.onPress();
  });
  expect(() => root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toThrow();

  const allChip = findChipByLabel(root, '全て')!;
  act(() => {
    allChip.props.onPress();
  });
  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
});

test('セッションカードをタップすると読み込む種目を選ぶ画面へ遷移する', async () => {
  const root = await renderResolved([chestSession]);
  const card = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes('ベンチプレス'))!;
  act(() => {
    card.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/session-history-load',
    params: { sessionId: '99', sourceSessionId: '1', sourceStartedAt: String(chestSession.startedAt) },
  });
});

test('複数セッションが表示された状態で、押したカードに対応するsourceSessionIdが渡る（先頭固定になっていないことの確認）', async () => {
  const root = await renderResolved([chestSession, legSession]);
  const legCard = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes('スクワット'))!;
  act(() => {
    legCard.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/session-history-load',
    params: { sessionId: '99', sourceSessionId: '2', sourceStartedAt: String(legSession.startedAt) },
  });
});

test('カードを連打してもpushは1回しか呼ばれない（useDebouncedPushによる二重遷移防止）', async () => {
  const root = await renderResolved([chestSession]);
  const card = root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes('ベンチプレス'))!;
  act(() => {
    card.props.onPress();
    card.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('同じ暦日に2セッションある場合、開始時刻を表示せず両方のカードが表示される', async () => {
  const morningBench: PastTrainingSession = {
    sessionId: 3,
    startedAt: new Date(2026, 6, 3, 7, 0).getTime(),
    exercises: [{ exerciseId: 10, name: 'ベンチプレス', category: 'chest' }],
  };
  const eveningBench: PastTrainingSession = {
    sessionId: 4,
    startedAt: new Date(2026, 6, 3, 19, 0).getTime(),
    exercises: [{ exerciseId: 11, name: 'ラットプルダウン', category: 'back' }],
  };
  const root = await renderResolved([eveningBench, morningBench]);
  expect(() => root.findByProps({ children: '19:00' })).toThrow();
  expect(() => root.findByProps({ children: '07:00' })).toThrow();
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(root.findByProps({ children: 'ラットプルダウン' })).toBeDefined();
});

test('sessionIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc' });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
  expect(mockGetPastTrainingSessions).not.toHaveBeenCalled();
});

test('月ごとにセクション見出しを表示する', async () => {
  const root = await renderResolved([chestSession, legSession]);
  expect(root.findByProps({ children: '2026年7月' })).toBeDefined();
  expect(root.findByProps({ children: '2026年6月' })).toBeDefined();
});

test('取得中はActivityIndicatorを表示する', () => {
  mockGetPastTrainingSessions.mockReturnValue(new Promise(() => {}));
  const root = render();
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
});
