// useExerciseProgress は、SQLで引いた生セット行を lib/exercises/progress.ts に渡して
// グラフ用の系列に組み立てる。組み立てそのものは progress.test.ts が見ているので、ここでは
// フックが担っている「派生の決め方」を固定する。
//   - loaded を updatedAt で判定する（dataは解決前から[]なので data !== undefined だと常にtrue）
//   - failed を loaded と分けて返す（取得失敗と0件は見せ方が違う）
//   - 選べなくなった指標を 'best' に落とす
//   - 空状態の判定用に bestSeries を選択中の系列と別に返す
//   - pairedWeights が総重量にだけ効き、最大重量には効かない
/* eslint-disable no-var */
var mockLiveQueryResult: { data?: unknown; updatedAt?: Date; error?: Error };

jest.mock('@/db/client', () => {
  const chain = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };
  return {
    db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }) },
  };
});

jest.mock('@/db/schema', () => ({
  sets: {
    workoutSessionExerciseId: 'workoutSessionExerciseId',
    exerciseId: 'exerciseId',
    setNumber: 'setNumber',
    weight: 'weight',
    reps: 'reps',
    durationSeconds: 'durationSeconds',
    distanceMeters: 'distanceMeters',
    completedAt: 'completedAt',
  },
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId' },
  workoutSessions: { id: 'id', startedAt: 'startedAt' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryResult),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { ProgressMetric } from '@/lib/exercises/progress';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date('2026-07-01T03:00:00Z').getTime();

type Row = {
  sessionId: number;
  workoutSessionExerciseId: number;
  startedAt: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completedAt: number | null;
};

function row(overrides: Partial<Row> & Pick<Row, 'startedAt'>): Row {
  return {
    sessionId: 1,
    workoutSessionExerciseId: 1,
    setNumber: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: overrides.startedAt,
    ...overrides,
  };
}

function mount(
  measurementType: MeasurementType,
  metric: ProgressMetric = 'best',
  pairedWeights = false,
) {
  let captured: ReturnType<typeof useExerciseProgress>;
  function Harness() {
    captured = useExerciseProgress(1, measurementType, metric, pairedWeights);
    return null;
  }
  act(() => {
    create(React.createElement(Harness));
  });
  return captured!;
}

beforeEach(() => {
  mockLiveQueryResult = { data: [] };
  jest.clearAllMocks();
});

describe('useExerciseProgress の読み込み状態', () => {
  it('解決前（updatedAtなし・dataは空配列）は loaded=false のままにする', () => {
    mockLiveQueryResult = { data: [] };

    const result = mount('weight_reps');

    expect(result.loaded).toBe(false);
    expect(result.failed).toBe(false);
    expect(result.series.points).toEqual([]);
  });

  it('解決したら loaded=true になる', () => {
    mockLiveQueryResult = { data: [], updatedAt: new Date() };

    expect(mount('weight_reps').loaded).toBe(true);
  });

  it('取得に失敗したときは loaded=true かつ failed=true を返す（空状態と区別させる）', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLiveQueryResult = { data: [], error: new Error('boom') };

    const result = mount('weight_reps');

    expect(result).toMatchObject({ loaded: true, failed: true });
    expect(spy).toHaveBeenCalledWith('[exercise progress]', expect.any(Error));
    spy.mockRestore();
  });
});

describe('useExerciseProgress の系列', () => {
  it('日ごとの最強セットを series と bestSeries の両方に置く', () => {
    mockLiveQueryResult = {
      data: [
        row({ startedAt: BASE, weight: 50, reps: 10 }),
        row({ startedAt: BASE, setNumber: 2, weight: 60, reps: 8 }),
        row({ startedAt: BASE + DAY, sessionId: 2, workoutSessionExerciseId: 2, weight: 70, reps: 6 }),
      ],
      updatedAt: new Date(),
    };

    const result = mount('weight_reps');

    expect(result.series.points.map((p) => p.value)).toEqual([60, 70]);
    expect(result.bestSeries.points.map((p) => p.value)).toEqual([60, 70]);
    expect(result.metric).toBe('best');
  });

  it('加重種目を加重なしでやった日は点を置けないが、recordDays には残す', () => {
    mockLiveQueryResult = {
      data: [
        row({ startedAt: BASE, weight: 50, reps: 10 }),
        row({
          startedAt: BASE + DAY,
          sessionId: 2,
          workoutSessionExerciseId: 2,
          weight: null,
          reps: 12,
        }),
      ],
      updatedAt: new Date(),
    };

    const result = mount('weight_reps');

    expect(result.series.points).toHaveLength(1);
    expect(result.recordDays).toHaveLength(2);
  });

  it('✓確定セットが1件も無い日は系列にも recordDays にも出さない', () => {
    mockLiveQueryResult = {
      data: [row({ startedAt: BASE, weight: 50, reps: 10, completedAt: null })],
      updatedAt: new Date(),
    };

    const result = mount('weight_reps');

    expect(result.series.points).toEqual([]);
    expect(result.recordDays).toEqual([]);
  });

  it('総重量では pairedWeights が効き、最大重量（bestSeries）には効かない', () => {
    mockLiveQueryResult = {
      data: [row({ startedAt: BASE, weight: 50, reps: 10 })],
      updatedAt: new Date(),
    };

    const paired = mount('weight_reps', 'total', true);
    const single = mount('weight_reps', 'total', false);

    expect(single.series.points[0].value).toBe(500);
    expect(paired.series.points[0].value).toBe(1000);
    expect(paired.bestSeries.points[0].value).toBe(single.bestSeries.points[0].value);
  });

  it('重量を1度も記録していない加重種目は reps 種目として描く', () => {
    mockLiveQueryResult = {
      data: [row({ startedAt: BASE, weight: null, reps: 12 })],
      updatedAt: new Date(),
    };

    expect(mount('weight_reps').chartMeasurementType).toBe('reps');
  });

  it('その計測タイプで選べない指標が渡されたら best に落とす', () => {
    mockLiveQueryResult = {
      data: [row({ startedAt: BASE, weight: null, reps: 12 })],
      updatedAt: new Date(),
    };

    // 重量が1件も無い加重種目は reps 扱いになるので、推定1RMは選べない
    expect(mount('weight_reps', 'e1rm').metric).toBe('best');
  });

  it('選べる指標ならそのまま維持する', () => {
    mockLiveQueryResult = {
      data: [row({ startedAt: BASE, weight: 50, reps: 10 })],
      updatedAt: new Date(),
    };

    expect(mount('weight_reps', 'e1rm').metric).toBe('e1rm');
  });
});
