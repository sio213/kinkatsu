import { computeSessionTotal, type SessionTotalRow } from '@/lib/workout/session-total';

function row(over: Partial<SessionTotalRow>): SessionTotalRow {
  return {
    measurementType: 'weight_reps',
    pairedWeights: false,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    // 既定は確定済み。✓なしの挙動を見るテストだけ明示的に落とす
    completed: true,
    ...over,
  };
}

describe('computeSessionTotal', () => {
  it('確定セットが無ければnull', () => {
    expect(computeSessionTotal([])).toBeNull();
  });

  it('重量種目があれば総重量（3桁区切り）', () => {
    const total = computeSessionTotal([
      row({ weight: 100, reps: 5 }),
      row({ weight: 100, reps: 5 }),
      row({ weight: 95, reps: 5 }),
    ]);
    expect(total).toEqual({ label: '総重量', value: '1,475', unit: 'kg' });
  });

  // 記録タブのセッションカード・種目詳細の総重量と同じ倍率でないと、同じ日の総量が画面ごとに食い違う
  it('左右2つ分の種目（pairedWeights）は2倍で数える', () => {
    const total = computeSessionTotal([row({ weight: 10, reps: 10, pairedWeights: true })]);
    expect(total).toEqual({ label: '総重量', value: '200', unit: 'kg' });
  });

  it('2.5kg刻みで小数になる合計は整数に丸める', () => {
    const total = computeSessionTotal([row({ weight: 2.5, reps: 5 })]);
    expect(total).toEqual({ label: '総重量', value: '13', unit: 'kg' });
  });

  it('回数のみの種目しか無ければ合計回数', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'reps', reps: 12 }),
      row({ measurementType: 'reps', reps: 10 }),
    ]);
    expect(total).toEqual({ label: '合計回数', value: '22', unit: '回' });
  });

  it('時間種目しか無ければ合計時間。60秒未満は秒のまま', () => {
    const total = computeSessionTotal([row({ measurementType: 'time', durationSeconds: 45 })]);
    expect(total).toEqual({ label: '合計時間', value: '45', unit: '秒' });
  });

  it('合計時間が60秒以上なら分に切り替える', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'time', durationSeconds: 60 }),
      row({ measurementType: 'time', durationSeconds: 90 }),
    ]);
    expect(total).toEqual({ label: '合計時間', value: '3', unit: '分' });
  });

  // 加重ホールドは足せる重量を持たない（progress.tsのTOTAL_UNITSにweight_timeが無い）ので、
  // 保持時間の合計として扱う
  it('加重ホールド（weight_time）は合計時間として数える', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'weight_time', weight: 20, durationSeconds: 60 }),
      row({ measurementType: 'weight_time', weight: 20, durationSeconds: 60 }),
    ]);
    expect(total).toEqual({ label: '合計時間', value: '2', unit: '分' });
  });

  it('距離種目しか無ければ合計距離（km・小数1桁）', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'distance_time', distanceMeters: 3000 }),
      row({ measurementType: 'distance_time', distanceMeters: 2500 }),
    ]);
    expect(total).toEqual({ label: '合計距離', value: '5.5', unit: 'km' });
  });

  it('重量種目と回数種目が混在していれば総重量を優先する', () => {
    const total = computeSessionTotal([
      row({ weight: 60, reps: 10 }),
      row({ measurementType: 'reps', reps: 20 }),
    ]);
    expect(total).toEqual({ label: '総重量', value: '600', unit: 'kg' });
  });

  // 重量欄を1度も埋めていない加重種目で「総重量 0kg」を主役に据えないための降格。
  // グラフ側のresolveChartMeasurementTypeが同じ状況をreps種目として描くのと揃えている
  it('重量種目でも重量が1件も入っていなければ合計回数に降りる', () => {
    const total = computeSessionTotal([row({ weight: null, reps: 12 }), row({ weight: null, reps: 10 })]);
    expect(total).toEqual({ label: '合計回数', value: '22', unit: '回' });
  });

  // set-row.tsxは全欄が空でも✓を押せるため、確定セットはあるのに合計が立たない状態が実際に起こる。
  // 「総重量 0kg」を主役に据えるとやった内容が0扱いされたように見えるので、値なしとして返す
  // 合計が1つも立たなくても、何を記録する画面だったかは種目の計測タイプから決まる
  it('全欄が空のまま✓を押した場合も、計測タイプからラベルだけは決める', () => {
    expect(computeSessionTotal([row({ weight: null, reps: null })])).toEqual({
      label: '総重量',
      value: null,
      unit: null,
    });
    expect(computeSessionTotal([row({ measurementType: 'reps', reps: null })])).toEqual({
      label: '合計回数',
      value: null,
      unit: null,
    });
  });

  it('重量だけ入れて回数が空欄のままなら「総重量」で値なし（0kgを主役にしない）', () => {
    expect(computeSessionTotal([row({ weight: 100, reps: null })])).toEqual({
      label: '総重量',
      value: null,
      unit: null,
    });
  });

  // 距離種目は距離と時間の両方を記録する（MEASUREMENT_COLUMNS.distance_time）。時間の合計を
  // 計測タイプではなく列の有無で拾うと、ランニングがTOTAL_ORDERの先にあるtimeへ吸われてしまう
  it('距離種目は時間も記録しているが、合計距離として扱う', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'distance_time', distanceMeters: 5000, durationSeconds: 1800 }),
    ]);
    expect(total).toEqual({ label: '合計距離', value: '5.0', unit: 'km' });
  });

  it('時間種目と距離種目が混在しても、時間の合計に距離種目の所要時間を混ぜない', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'time', durationSeconds: 60 }),
      row({ measurementType: 'distance_time', distanceMeters: 5000, durationSeconds: 1800 }),
    ]);
    expect(total).toEqual({ label: '合計時間', value: '1', unit: '分' });
  });

  // 値は入れたが✓を1つも押さずに終了した場合。記録として成立しないので合計は出せないが、
  // 「何の合計を出す画面か」は種目の計測タイプから決まる（@ユーザー指摘、実機で確認）
  describe('✓が1つも無いセッション', () => {
    it('回数のみの種目なら「合計回数」で値なし（総重量に固定しない）', () => {
      const total = computeSessionTotal([
        row({ measurementType: 'reps', reps: 12, completed: false }),
        row({ measurementType: 'reps', reps: 10, completed: false }),
      ]);
      expect(total).toEqual({ label: '合計回数', value: null, unit: null });
    });

    it('重量種目なら「総重量」で値なし', () => {
      const total = computeSessionTotal([row({ weight: 100, reps: 5, completed: false })]);
      expect(total).toEqual({ label: '総重量', value: null, unit: null });
    });

    it('距離種目なら「合計距離」で値なし', () => {
      const total = computeSessionTotal([
        row({ measurementType: 'distance_time', distanceMeters: 5000, durationSeconds: 1800, completed: false }),
      ]);
      expect(total).toEqual({ label: '合計距離', value: null, unit: null });
    });
  });

  // ラベルは確定セットから決める。✓未確定の重量セットに引きずられて「総重量 —」にしない
  it('確定セットと未確定セットが混在する場合、確定セット側で決める', () => {
    const total = computeSessionTotal([
      row({ measurementType: 'reps', reps: 12, completed: true }),
      row({ weight: 100, reps: 5, completed: false }),
    ]);
    expect(total).toEqual({ label: '合計回数', value: '12', unit: '回' });
  });

  // 想定外のDB値でも画面ごと落とさない（resolveMeasurementTypeがweight_repsへフォールバックする）
  it('未知のmeasurementTypeは重量×回数として扱う', () => {
    const total = computeSessionTotal([row({ measurementType: 'unknown', weight: 50, reps: 4 })]);
    expect(total).toEqual({ label: '総重量', value: '200', unit: 'kg' });
  });
});
