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

  it('単一entryのみなら必ずそのentryが自己ベストになる', () => {
    const e = entry(1, 1000, [confirmedSet({ weight: 60 })]);
    expect(computePersonalBestIds([e], 'weight_reps')).toEqual(new Set([1]));
  });

  it('自己ベストは常に1件だけ（複数entryが順に記録を更新していても最終的な最大値の1件のみ）', () => {
    const entries = [
      entry(3, 3000, [confirmedSet({ weight: 62.5, reps: 8 })]),
      entry(2, 2000, [confirmedSet({ weight: 57.5, reps: 8 })]),
      entry(1, 1000, [confirmedSet({ weight: 55, reps: 8 })]),
    ];
    const result = computePersonalBestIds(entries, 'weight_reps');
    expect(result.size).toBe(1);
    expect(result).toEqual(new Set([3]));
  });

  it('重量が最大のentryが選ばれる（weight_reps）', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ weight: 55, reps: 10 })]),
      entry(2, 2000, [confirmedSet({ weight: 62.5, reps: 8 })]),
      entry(3, 3000, [confirmedSet({ weight: 60, reps: 8 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([2]));
  });

  it('重量が同じ場合は回数が多い方を優先する', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ weight: 60, reps: 8 })]),
      entry(2, 2000, [confirmedSet({ weight: 60, reps: 10 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([2]));
  });

  it('重量・回数が同じ場合はセット数に関わらず最初にその記録を達成した日（より古い日付）を優先する', () => {
    // 後からセット数を稼いだだけの日をベスト扱いにしない（@user-advisorレビュー: セット数・総量は
    // 追い込み度の指標であって自己ベストの判定材料ではない、というフィードバックに基づく）
    const entries = [
      entry(1, 1000, [confirmedSet({ weight: 60, reps: 8 })]),
      entry(2, 2000, [
        confirmedSet({ weight: 60, reps: 8 }),
        confirmedSet({ weight: 55, reps: 8, setNumber: 2 }),
        confirmedSet({ weight: 55, reps: 8, setNumber: 3 }),
      ]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([1]));

    // 呼び出し順（新しい順で渡されるケース）を入れ替えても結果は変わらない
    const reversed = [entries[1], entries[0]];
    expect(computePersonalBestIds(reversed, 'weight_reps')).toEqual(new Set([1]));
  });

  it('1entry内に複数セットがある場合はentry内の最大重量同士で比較する', () => {
    const entries = [
      entry(2, 2000, [confirmedSet({ weight: 60, reps: 8 }), confirmedSet({ weight: 65, reps: 5 })]),
      entry(1, 1000, [confirmedSet({ weight: 55, reps: 8 })]),
    ];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set([2]));
  });

  it('weight_timeは時間でなく重量で判定し、同重量なら時間で比較する', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ weight: 20, durationSeconds: 60 })]),
      entry(2, 2000, [confirmedSet({ weight: 30, durationSeconds: 10 })]), // 重量が重い→こちらが自己ベスト
      entry(3, 3000, [confirmedSet({ weight: 30, durationSeconds: 45 })]), // 同重量なら時間が長い方
    ];
    expect(computePersonalBestIds(entries, 'weight_time')).toEqual(new Set([3]));
  });

  it('repsは回数の最大値で判定する', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ reps: 10 })]),
      entry(2, 2000, [confirmedSet({ reps: 12 })]),
    ];
    expect(computePersonalBestIds(entries, 'reps')).toEqual(new Set([2]));
  });

  it('timeは時間(durationSeconds)の最大値で判定する', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ durationSeconds: 60 })]),
      entry(2, 2000, [confirmedSet({ durationSeconds: 90 })]),
    ];
    expect(computePersonalBestIds(entries, 'time')).toEqual(new Set([2]));
  });

  it('distance_timeは距離(distanceMeters)の最大値で判定する', () => {
    const entries = [
      entry(1, 1000, [confirmedSet({ distanceMeters: 5000 })]),
      entry(2, 2000, [confirmedSet({ distanceMeters: 6000 })]),
    ];
    expect(computePersonalBestIds(entries, 'distance_time')).toEqual(new Set([2]));
  });

  it('値が未入力(null)のセットしか無いentryは自己ベスト判定から除外される（0扱いで最古の記録が誤って選ばれない）', () => {
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

  it('全entryが確定セットを持たない場合は空Setを返す', () => {
    const entries = [entry(1, 1000, [confirmedSet({ weight: 60, completedAt: null })])];
    expect(computePersonalBestIds(entries, 'weight_reps')).toEqual(new Set());
  });

  it('呼び出し元のentries配列の順序を変更しない（破壊的ソートをしない）', () => {
    const entries = [entry(2, 2000, [confirmedSet({ weight: 60 })]), entry(1, 1000, [confirmedSet({ weight: 55 })])];
    const original = [...entries];
    computePersonalBestIds(entries, 'weight_reps');
    expect(entries).toEqual(original);
  });
});
