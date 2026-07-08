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
import { ActivityIndicator, SectionList, TouchableOpacity } from 'react-native';
import SessionHistoryPickerScreen, { PAGE_SIZE } from '@/app/workout/session-history-picker';
import * as historyModule from '@/lib/workout/history';
import type { PastTrainingSession, PastTrainingSessionsPage } from '@/lib/workout/history';

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

function page(sessions: PastTrainingSession[], hasMore = false): PastTrainingSessionsPage {
  return { sessions, hasMore };
}

async function renderResolved(sessions: PastTrainingSession[] | Error, hasMore = false) {
  if (sessions instanceof Error) {
    mockGetPastTrainingSessions.mockRejectedValue(sessions);
  } else {
    mockGetPastTrainingSessions.mockResolvedValue(page(sessions, hasMore));
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

  mockGetPastTrainingSessions.mockResolvedValue(page([chestSession]));
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

test('初回取得はPAGE_SIZE件・offset0で呼ばれる', async () => {
  await renderResolved([chestSession]);
  expect(mockGetPastTrainingSessions).toHaveBeenCalledWith(99, { limit: PAGE_SIZE, offset: 0 });
});

test('末尾までスクロールすると次のoffsetで追加取得し、結果が末尾に追加される', async () => {
  const root = await renderResolved([chestSession], true);
  mockGetPastTrainingSessions.mockResolvedValueOnce(page([legSession]));

  await act(async () => {
    root.findByType(SectionList).props.onEndReached();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockGetPastTrainingSessions).toHaveBeenLastCalledWith(99, { limit: PAGE_SIZE, offset: PAGE_SIZE });
  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
});

test('hasMoreがfalseなら末尾に達しても追加取得しない', async () => {
  const root = await renderResolved([chestSession], false);
  mockGetPastTrainingSessions.mockClear();

  act(() => {
    root.findByType(SectionList).props.onEndReached();
  });

  expect(mockGetPastTrainingSessions).not.toHaveBeenCalled();
});

test('追加取得中はリスト末尾にActivityIndicatorを表示する', async () => {
  const root = await renderResolved([chestSession], true);
  mockGetPastTrainingSessions.mockReturnValueOnce(new Promise(() => {}));

  act(() => {
    root.findByType(SectionList).props.onEndReached();
  });

  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
});

test('追加取得が失敗しても画面全体はエラー状態にならず、既存の一覧は表示され続ける', async () => {
  const root = await renderResolved([chestSession], true);
  mockGetPastTrainingSessions.mockRejectedValueOnce(new Error('fail'));

  await act(async () => {
    root.findByType(SectionList).props.onEndReached();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
  expect(() => root.findByProps({ children: '記録を読み込めませんでした' })).toThrow();
});

test('追加取得が失敗すると、フッターに再試行ボタンが表示され、押すと同じoffsetで再取得する', async () => {
  const root = await renderResolved([chestSession], true);
  mockGetPastTrainingSessions.mockRejectedValueOnce(new Error('fail'));

  await act(async () => {
    root.findByType(SectionList).props.onEndReached();
    await Promise.resolve();
    await Promise.resolve();
  });

  const retryBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.props.accessibilityLabel === '記録の読み込みを再試行')!;
  expect(retryBtn).toBeDefined();

  mockGetPastTrainingSessions.mockResolvedValueOnce(page([legSession]));
  await act(async () => {
    retryBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  // 失敗時にoffsetを進めていないため、リトライは同じoffset（PAGE_SIZE）で再取得する
  expect(mockGetPastTrainingSessions).toHaveBeenLastCalledWith(99, { limit: PAGE_SIZE, offset: PAGE_SIZE });
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
});

test('onEndReachedが同一tick内で連続発火しても、次ページの取得は1回だけ（refガードによる二重フェッチ防止）', async () => {
  const root = await renderResolved([chestSession], true);
  let resolvePage2!: (p: PastTrainingSessionsPage) => void;
  mockGetPastTrainingSessions.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePage2 = resolve; }),
  );

  act(() => {
    const list = root.findByType(SectionList);
    // RN実機ではスクロールの勢いでonEndReachedが同一tick内で連続発火することがある
    list.props.onEndReached();
    list.props.onEndReached();
  });

  await act(async () => {
    resolvePage2(page([legSession]));
    await Promise.resolve();
    await Promise.resolve();
  });

  const secondPageCalls = mockGetPastTrainingSessions.mock.calls.filter(
    ([, opts]) => (opts as { offset: number }).offset === PAGE_SIZE,
  );
  expect(secondPageCalls).toHaveLength(1);
  // 二重フェッチしていれば offset は PAGE_SIZE*2 になってしまうところ、正しくPAGE_SIZE*2で1回だけ呼ばれる
  expect(mockGetPastTrainingSessions).toHaveBeenLastCalledWith(99, { limit: PAGE_SIZE, offset: PAGE_SIZE });
});

test('カテゴリ絞り込み中、該当ページがヒット無しでもhasMoreなら自動で次ページを取得し続ける', async () => {
  const root = await renderResolved([chestSession, legSession], true);
  const legChip = findChipByLabel(root, '脚')!;
  act(() => {
    legChip.props.onPress();
  });
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();

  const chestOnlySession: PastTrainingSession = {
    sessionId: 5,
    startedAt: new Date(2026, 4, 1, 10, 0).getTime(),
    exercises: [{ exerciseId: 30, name: 'インクラインベンチプレス', category: 'chest' }],
  };
  const legMatchSession: PastTrainingSession = {
    sessionId: 6,
    startedAt: new Date(2026, 3, 1, 10, 0).getTime(),
    exercises: [{ exerciseId: 31, name: 'レッグプレス', category: 'leg' }],
  };
  // 1ページ目は「脚」を含まないため、ユーザーが再度スクロールしなくても自動で次ページを取りに行くはず
  mockGetPastTrainingSessions.mockResolvedValueOnce(page([chestOnlySession], true));
  mockGetPastTrainingSessions.mockResolvedValueOnce(page([legMatchSession], false));

  await act(async () => {
    root.findByType(SectionList).props.onEndReached();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockGetPastTrainingSessions).toHaveBeenLastCalledWith(99, { limit: PAGE_SIZE, offset: PAGE_SIZE * 2 });
  expect(root.findByProps({ children: 'レッグプレス' })).toBeDefined();
});

test('カテゴリ絞り込み中に該当が最後まで見つからなくても、hasMoreが尽きた時点で自動継続が止まる（無限ループしない）', async () => {
  const root = await renderResolved([chestSession, legSession], true);
  const legChip = findChipByLabel(root, '脚')!;
  act(() => {
    legChip.props.onPress();
  });

  const chestOnlySession: PastTrainingSession = {
    sessionId: 5,
    startedAt: new Date(2026, 4, 1, 10, 0).getTime(),
    exercises: [{ exerciseId: 30, name: 'インクラインベンチプレス', category: 'chest' }],
  };
  // どのページも「脚」を含まないまま、2ページ目でhasMore=falseになり尽きるケース
  mockGetPastTrainingSessions.mockResolvedValueOnce(page([chestOnlySession], true));
  mockGetPastTrainingSessions.mockResolvedValueOnce(page([], false));

  await act(async () => {
    root.findByType(SectionList).props.onEndReached();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  // hasMoreが尽きた時点で自動継続が止まり、それ以上フェッチが呼ばれない
  expect(mockGetPastTrainingSessions).toHaveBeenCalledTimes(3); // 初回 + 自動継続2回
  expect(mockGetPastTrainingSessions).toHaveBeenLastCalledWith(99, { limit: PAGE_SIZE, offset: PAGE_SIZE * 2 });
  // 該当が無いまま尽きたので絞り込み結果は0件のまま
  expect(() => root.findByProps({ children: 'インクラインベンチプレス' })).toThrow();
});
