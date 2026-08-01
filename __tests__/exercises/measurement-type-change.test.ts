import { buildProgressSeries, buildRecordDays, type ProgressSetRow } from '@/lib/exercises/progress';
import { MEASUREMENT_COLUMNS, formatHistorySetSummary } from '@/lib/workout/set-format';

/**
 * 「記録する項目」を変更したときに、記録がどう再解釈されるか。
 *
 * setsは計測タイプごとの列を持つ1枚のワイドテーブルで、記録行自体は計測タイプを持たない。
 * 表示のたびに種目側の型で列を選び直すため、型を変えてもDBの値は書き換わらない——これが
 * 確認ダイアログの「記録は削除されず、元に戻せば再表示されます」という文言の根拠。
 * その約束が実装で成り立っていることを、種目側の型だけを差し替えて確認する。
 */

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

function row(overrides: Partial<ProgressSetRow> & { startedAt: number; setNumber: number }): ProgressSetRow {
  return {
    sessionId: 1,
    workoutSessionExerciseId: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: overrides.startedAt,
    ...overrides,
  };
}

// weight_repsとして記録された2日分。durationSeconds・distanceMetersは入っていない
const ROWS: ProgressSetRow[] = [
  row({ startedAt: at(2026, 7, 20), setNumber: 1, weight: 60, reps: 10 }),
  row({ startedAt: at(2026, 7, 20), setNumber: 2, weight: 65, reps: 8 }),
  row({ startedAt: at(2026, 7, 27), setNumber: 1, weight: 70, reps: 6 }),
];

describe('計測タイプを変更したときのグラフ（buildProgressSeries）', () => {
  test('列が重なる変更（重量×回数 → 回数のみ）では点が落ちない', () => {
    const after = buildProgressSeries('reps', ROWS);

    expect(after.points).toHaveLength(2);
    expect(after.unit.label).toBe('回');
    // その日の最大回数
    expect(after.points[0].value).toBe(10);
  });

  test('列が重ならない変更（重量×回数 → 時間のみ）ではグラフが空になる', () => {
    const after = buildProgressSeries('time', ROWS);

    expect(after.points).toHaveLength(0);
  });

  test('元の計測タイプに戻すとグラフが完全に復元される', () => {
    const before = buildProgressSeries('weight_reps', ROWS);
    buildProgressSeries('time', ROWS);
    const restored = buildProgressSeries('weight_reps', ROWS);

    expect(restored.unit).toEqual(before.unit);
    expect(restored.points.map((p) => [p.dateKey, p.value])).toEqual(
      before.points.map((p) => [p.dateKey, p.value]),
    );
  });
});

describe('計測タイプを変更したときの記録一覧（buildRecordDays）', () => {
  test('値が置けない計測タイプに変えても、記録した日そのものは一覧から消えない', () => {
    expect(buildRecordDays('weight_reps', ROWS)).toHaveLength(2);
    expect(buildRecordDays('time', ROWS)).toHaveLength(2);
  });

  test('ただしセット要約は空になる（＝一覧の行は残るが中身が見えなくなる）', () => {
    const sets = ROWS.slice(0, 2);

    expect(formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, sets)).toBe('60kg×10・65kg×8');
    expect(formatHistorySetSummary(MEASUREMENT_COLUMNS.time, sets)).toBe('');
    // 元に戻せば再表示される
    expect(formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, sets)).toBe('60kg×10・65kg×8');
  });
});
