const mockUseExercise = jest.fn();

jest.mock('expo-router', () => ({
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
// spyOnで差し替える（各history-picker画面のテストと同じ理由でdb/client等は最小限モックする）
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

import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ExerciseHistoryPickerView } from '@/components/workout/exercise-history-picker-view';
import * as historyModule from '@/lib/workout/history';
import type { HistoryEntry } from '@/lib/workout/history';

const mockGetExerciseHistoryEntries = jest.spyOn(historyModule, 'getExerciseHistoryEntries');

// app/routine/history-picker.tsx・app/workout/history-picker.tsxが共有するビューの単体テスト。
// 各画面のスクリーンテストは「どの値をpropsへ渡すか」という配線を検証しているが、
// ルーティン版はonLoadが同期処理のため、共通化で新たに効くようになったエラーハンドリングと
// 読み込み中表示が画面テストからは露出しない。ビューの契約はここで直接押さえる

const entry1: HistoryEntry = {
  workoutSessionExerciseId: 100,
  sessionId: 1,
  startedAt: new Date('2026-07-01T10:00:00').getTime(),
  sets: [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};
const entry2: HistoryEntry = {
  workoutSessionExerciseId: 101,
  sessionId: 2,
  startedAt: new Date('2026-06-01T10:00:00').getTime(),
  sets: [{ setNumber: 1, weight: 80, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};

const FIXED_NOW = new Date(2026, 6, 3, 12, 0, 0).getTime();

type Overrides = {
  excludeSessionId?: number;
  hasRecordedData?: boolean;
  confirmMessage?: string;
  onPressBack?: () => void;
  onLoad?: (entry: HistoryEntry) => Promise<void>;
};

function renderView(overrides: Overrides = {}) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(ExerciseHistoryPickerView, {
        exerciseId: 10,
        exerciseName: 'ベンチプレス',
        excludeSessionId: overrides.excludeSessionId ?? -1,
        hasRecordedData: overrides.hasRecordedData ?? false,
        confirmMessage: overrides.confirmMessage ?? '設定済みのセット内容は失われます。',
        onPressBack: overrides.onPressBack ?? jest.fn(),
        onLoad: overrides.onLoad ?? jest.fn(async () => {}),
      }),
    );
  });
  return instance.root;
}

async function renderResolved(entries: HistoryEntry[] | Error, overrides: Overrides = {}) {
  if (entries instanceof Error) {
    mockGetExerciseHistoryEntries.mockRejectedValue(entries);
  } else {
    mockGetExerciseHistoryEntries.mockResolvedValue(entries);
  }
  const root = renderView(overrides);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

function loadButtonFor(root: ReactTestInstance, dateLabel: string) {
  return root.findByProps({ accessibilityLabel: `${dateLabel}の記録を読み込む` });
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();
  mockUseExercise.mockReturnValue({ exercise: { id: 10, name: 'ベンチプレス', measurementType: 'weight_reps' } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('取得', () => {
  test('渡されたexerciseIdとexcludeSessionIdでgetExerciseHistoryEntriesを呼ぶ', async () => {
    await renderResolved([entry1], { excludeSessionId: 7 });
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(10, 7);
  });

  test('0件のときはonPressBackを持つ空状態を表示する', async () => {
    const onPressBack = jest.fn();
    const root = await renderResolved([], { onPressBack });

    expect(root.findByProps({ children: 'この種目の過去の記録がまだありません' })).toBeDefined();
    act(() => {
      findButtonByLabel(root, '戻る')!.props.onPress();
    });

    expect(onPressBack).toHaveBeenCalled();
  });

  test('取得失敗時は再試行ボタンから再取得できる', async () => {
    const root = await renderResolved(new Error('fail'));
    expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();

    mockGetExerciseHistoryEntries.mockResolvedValue([entry1]);
    await act(async () => {
      findButtonByLabel(root, '再試行')!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(() => root.findByProps({ children: '記録を読み込めませんでした' })).toThrow();
  });
});

describe('確認ダイアログ', () => {
  test('hasRecordedDataがfalseなら確認なしでonLoadが呼ばれる', async () => {
    const onLoad = jest.fn(async () => {});
    const root = await renderResolved([entry1], { onLoad });

    act(() => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledWith(entry1);
  });

  test('hasRecordedDataがtrueならconfirmMessageの文言をそのまま確認ダイアログに使う', async () => {
    const onLoad = jest.fn(async () => {});
    const root = await renderResolved([entry1], {
      hasRecordedData: true,
      confirmMessage: '入力済みの記録は失われます。',
      onLoad,
    });

    act(() => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      '7月1日（水）の記録を読み込みますか？',
      '入力済みの記録は失われます。',
      expect.anything(),
    );
    expect(onLoad).not.toHaveBeenCalled();
  });
});

// ルーティン版のonLoadは下書きストアへの同期更新のため、共通化前は読み込み中表示も
// エラーハンドリングも存在しなかった。共通ビュー経由で新たに効くようになった契約をここで固定する
describe('読み込み中の状態', () => {
  test('onLoad実行中は押したカードがbusyになり、他のカードは操作できなくなる', async () => {
    let resolveLoad!: () => void;
    const onLoad = jest.fn(() => new Promise<void>((resolve) => (resolveLoad = resolve)));
    const root = await renderResolved([entry1, entry2], { onLoad });

    act(() => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
    });

    expect(loadButtonFor(root, '7月1日（水）').props.accessibilityState).toEqual({ disabled: true, busy: true });
    // 押していない側はスピナーにはならないが、二重操作を防ぐため無効化される
    expect(loadButtonFor(root, '6月1日（月）').props.accessibilityState).toEqual({ disabled: true, busy: false });

    await act(async () => {
      resolveLoad();
    });

    expect(loadButtonFor(root, '7月1日（水）').props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(loadButtonFor(root, '6月1日（月）').props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  // ルーティン側のonLoadは下書きストアへの同期更新をasyncで包んだだけで、awaitを挟まず
  // 即座に完了する。この場合でもisLoadingRefのリセットはマイクロタスク送りになるため、
  // 同一イベント内の連打は防がれる
  test('onLoadが即座に完了する場合でも連打でonLoadは1回しか呼ばれない', async () => {
    const onLoad = jest.fn(async () => {});
    const root = await renderResolved([entry1], { onLoad });

    act(() => {
      const button = loadButtonFor(root, '7月1日（水）');
      button.props.onPress();
      button.props.onPress();
    });

    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe('エラーハンドリング', () => {
  test('onLoadがrejectするとAlertを出し、読み込み中状態が解除されて再実行できる', async () => {
    const onLoad = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);
    const root = await renderResolved([entry1], { onLoad });

    await act(async () => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '記録を読み込めませんでした。');
    expect(loadButtonFor(root, '7月1日（水）').props.accessibilityState).toEqual({ disabled: false, busy: false });

    act(() => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
    });

    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  // 型上はonLoadがPromise<void>を返す契約だが、awaitに到達する前の同期throwも同じcatchで
  // 拾えることを防御的に固定しておく（共通化前のルーティン版はtry/catch自体を持っていなかった）
  test('onLoadが同期でthrowしてもcatchされAlertを出す', async () => {
    const onLoad = jest.fn(() => {
      throw new Error('sync fail');
    }) as unknown as (entry: HistoryEntry) => Promise<void>;
    const root = await renderResolved([entry1], { onLoad });

    await act(async () => {
      loadButtonFor(root, '7月1日（水）').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '記録を読み込めませんでした。');
    expect(loadButtonFor(root, '7月1日（水）').props.accessibilityState).toEqual({ disabled: false, busy: false });
  });
});
