const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockAddExercises = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown; title?: string } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// session-history-load-screen.test.tsxと同じ理由でdb/client等は最小限モックする
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

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: { addExercises: (...args: unknown[]) => unknown }) => unknown) =>
    selector({ addExercises: mockAddExercises }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import RoutineSessionHistoryLoadScreen from '@/app/routine/session-history-load';
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
    instance = create(React.createElement(RoutineSessionHistoryLoadScreen));
  });
  return instance.root;
}

async function renderResolved(cards: SessionHistoryCard[]) {
  mockGetSessionExerciseCards.mockResolvedValue(cards);
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
    sourceSessionId: '99',
    sourceStartedAt: String(new Date(2026, 6, 3, 10, 0).getTime()),
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('sourceSessionIdのみでworkoutSessionExercisesのカードを取得する(sessionIdパラメータは不要)', async () => {
  await renderResolved([benchCard]);
  expect(mockGetSessionExerciseCards).toHaveBeenCalledWith(99);
});

test('初期状態は全選択のため送信ボタンは「すべて読み込む」', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
});

test('連打してもaddExercisesは1回・dismiss(2)も1回しか呼ばれない', async () => {
  const root = await renderResolved([benchCard]);
  const submitBtn = findSubmitButton(root)!;

  act(() => {
    submitBtn.props.onPress();
    submitBtn.props.onPress();
  });

  expect(mockAddExercises).toHaveBeenCalledTimes(1);
  expect(mockDismiss).toHaveBeenCalledTimes(1);
});

test('送信すると選択した種目をDraftExercise[]へ変換してaddExercisesへ渡し、dismiss(2)する(DB書き込みは発生しない)', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  const submitBtn = findSubmitButton(root)!;

  act(() => {
    submitBtn.props.onPress();
  });

  expect(mockAddExercises).toHaveBeenCalledWith([
    {
      exerciseId: 10,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench_press',
      sets: [{ weight: 60, reps: 10, durationSeconds: null, distanceMeters: null }],
    },
    {
      exerciseId: 11,
      name: 'ダンベルフライ',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'dumbbell_fly',
      sets: [{ weight: 14, reps: 12, durationSeconds: null, distanceMeters: null }],
    },
  ]);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('一部だけ選択解除して送信すると、選択された種目だけがaddExercisesに渡る', async () => {
  const root = await renderResolved([benchCard, flyCard]);
  const flyRow = root
    .findAllByType(TouchableOpacity)
    .find(
      (btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.startsWith('ダンベルフライ'),
    )!;
  act(() => {
    flyRow.props.onPress();
  });
  const submitBtn = findSubmitButton(root)!;

  act(() => {
    submitBtn.props.onPress();
  });

  expect(mockAddExercises).toHaveBeenCalledWith([
    expect.objectContaining({ exerciseId: 10 }),
  ]);
});

test('sourceSessionIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ sourceSessionId: 'abc', sourceStartedAt: '0' });
  const root = render();
  expect(root.findByProps({ children: '記録が見つかりません' })).toBeDefined();
  expect(mockGetSessionExerciseCards).not.toHaveBeenCalled();
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
