// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// computePersonalBestIds（pure関数）だけをテストしたい場合でもjest環境では@/db/clientの
// モックが必要（session.test.tsと同じ理由）
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

import { computePersonalBestIds, type HistoryEntry } from '@/lib/workout/history';

function entry(
  workoutSessionExerciseId: number,
  startedAt: number,
  sets: HistoryEntry['sets'],
): HistoryEntry {
  return { workoutSessionExerciseId, startedAt, sets };
}

function confirmedSet(overrides: Partial<HistoryEntry['sets'][number]> = {}) {
  return {
    setNumber: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
    ...overrides,
  };
}

describe('computePersonalBestIds', () => {
  it('entriesが空配列なら空Setを返す', () => {
    expect(computePersonalBestIds([], 'weight_reps')).toEqual(new Set());
  });

  it('単一entryのみなら必ずそのentryがタグ付けされる', () => {
    const e = entry(1, 1000, [confirmedSet({ weight: 60 })]);
    expect(computePersonalBestIds([e], 'weight_reps')).toEqual(new Set([1]));
  });

  it('時系列で重量が更新された回だけタグ付けされる（weight_reps）', () => {
    const entries = [
      entry(3, 3000, [confirmedSet({ weight: 62.5 })]), // 更新なし（2番目と同値）
      entry(2, 2000, [confirmedSet({ weight: 62.5 })]), // 更新
      entry(1, 1000, [confirmedSet({ weight: 55 })]), // 最初の記録
    ];
    // 呼び出し側の並び順（新しい順）に関わらず内部で時系列に並べ直して判定する
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1, 2]));
  });

  it('同じ最大値に複数回到達しても、最初に到達した回だけがタグ対象（2回目以降は「更新」ではない）', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ weight: 60 })]),
      entry(1, 1000, [confirmedSet({ weight: 60 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1]));
  });

  it('1entry内に複数セットがある場合はentry内の最大値同士で比較する', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ weight: 60 }), confirmedSet({ weight: 65 })]),
      entry(1, 1000, [confirmedSet({ weight: 55 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1, 2]));
  });

  it('weight_timeは時間でなく重量で判定する', () => {
    const entries = [
      // 時間は短いが重量は重い→自己ベスト更新
      entry(2, 2000, [confirmedSet({ weight: 30, durationSeconds: 10 })]),
      entry(1, 1000, [confirmedSet({ weight: 20, durationSeconds: 60 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_time')).toEqual(new Set([1, 2]));
  });

  it('repsは回数で判定する', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ reps: 12 })]),
      entry(1, 1000, [confirmedSet({ reps: 10 })]),
    ];
    expect(computePersonalBestIds(entries, 'reps')).toEqual(new Set([1, 2]));
  });

  it('timeは時間(durationSeconds)で判定する', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ durationSeconds: 90 })]),
      entry(1, 1000, [confirmedSet({ durationSeconds: 60 })]),
    ];
    expect(computePersonalBestIds(entries, 'time')).toEqual(new Set([1, 2]));
  });

  it('distance_timeは距離(distanceMeters)で判定する', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ distanceMeters: 6000 })]),
      entry(1, 1000, [confirmedSet({ distanceMeters: 5000 })]),
    ];
    expect(computePersonalBestIds(entries, 'distance_time')).toEqual(new Set([1, 2]));
  });

  it('値が未入力(null)のセットしか無いentryは自己ベスト判定から除外される（0扱いで最古の記録が誤ってタグ付けされない）', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ weight: 60 })]),
      entry(1, 1000, [confirmedSet({ weight: null })]), // ✓済みだが値未入力
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([2]));
  });

  it('✓未確定（completedAt null）のセットは指標に含めない', () => {
    const entries = [
      // 2番目のカードは重量100だが✓未確定のため無視され、1番目(60)が自己ベストのまま
      entry(2, 2000, [confirmedSet({ weight: 100, completedAt: null })]),
      entry(1, 1000, [confirmedSet({ weight: 60 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1]));
  });

  it('全entryが同一値（一度も更新が無い）場合は最初の1件だけタグ付けされる', () => {
    const entries = [
      entry(3, 3000, [confirmedSet({ weight: 60 })]),
      entry(2, 2000, [confirmedSet({ weight: 60 })]),
      entry(1, 1000, [confirmedSet({ weight: 60 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1]));
  });

  it('呼び出し元のentries配列の順序を変更しない（破壊的ソートをしない）', () => {
    const entries = [entry(2, 2000, [confirmedSet({ weight: 60 })]), entry(1, 1000, [confirmedSet({ weight: 55 })])];
    const original = [...entries];
    computePersonalBestIds(entries, 'weight_reps');
    expect(entries).toEqual(original);
  });
});
