import {
  applyRoutineDiff,
  buildRoutineDiff,
  formatRoutineDiffSummary,
  resolveExerciseSets,
  type DiffSelection,
} from '@/lib/routines/diff';

function set(weight: number | null, reps: number | null) {
  return { weight, reps, durationSeconds: null, distanceMeters: null };
}

function routineExercise(id: number, exerciseId: number, sets: ReturnType<typeof set>[], name = `種目${exerciseId}`) {
  return { id, exerciseId, name, category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: null, sets };
}

function card(
  workoutSessionExerciseId: number,
  exerciseId: number,
  sets: ReturnType<typeof set>[],
  name = `種目${exerciseId}`,
) {
  return {
    workoutSessionExerciseId,
    exerciseId,
    name,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets,
  };
}

// 選択の既定は「全種目チェック済み・セットは全部チェック済み（Map未登録＝全部オン）」
function selectAll(keys: string[]): DiffSelection {
  return { exercises: new Set(keys), sets: new Map() };
}

describe('buildRoutineDiff', () => {
  test('ルーティン通りなら差分ゼロ', () => {
    const diff = buildRoutineDiff([routineExercise(1, 10, [set(40, 10)])], [card(100, 10, [set(40, 10)])]);

    expect(diff).toEqual({ added: [], changed: [], removed: [] });
  });

  test('値が変わった種目はchangedに入り、セット単位の内訳を持つ', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10), set(40, 10)])],
      [card(100, 10, [set(50, 10), set(40, 10)])],
    );

    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].setDiffs).toEqual([
      { setNumber: 1, kind: 'changed', before: set(40, 10), after: set(50, 10) },
    ]);
  });

  // セット数の増減も「値の変更」。種目としては1件
  test('セットが増えた場合はaddedのセット差分になる', () => {
    const diff = buildRoutineDiff([routineExercise(1, 10, [set(40, 10)])], [card(100, 10, [set(40, 10), set(45, 8)])]);

    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].setDiffs).toEqual([{ setNumber: 2, kind: 'added', before: null, after: set(45, 8) }]);
  });

  test('セットが減った場合はremovedのセット差分になる', () => {
    const diff = buildRoutineDiff([routineExercise(1, 10, [set(40, 10), set(40, 8)])], [card(100, 10, [set(40, 10)])]);

    expect(diff.changed[0].setDiffs).toEqual([{ setNumber: 2, kind: 'removed', before: set(40, 8), after: null }]);
  });

  // 「3セットの重量を全部変えて1セット追加」でも種目としては1件（カードの件数と行数の1対1対応）
  test('1種目の中で複数のセットが変わっても種目としては1件', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 5), set(40, 5), set(40, 5)])],
      [card(100, 10, [set(50, 5), set(50, 5), set(50, 5), set(45, 5)])],
    );

    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].setDiffs).toHaveLength(4);
  });

  test('ルーティンに無い種目をやったらadded', () => {
    const diff = buildRoutineDiff([routineExercise(1, 10, [set(40, 10)])], [card(100, 10, [set(40, 10)]), card(101, 20, [set(30, 12)])]);

    expect(diff.added.map((e) => e.exerciseId)).toEqual([20]);
  });

  test('ルーティンにあるが今日やらなかった種目はremoved', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10)]), routineExercise(2, 20, [set(30, 12)])],
      [card(100, 10, [set(40, 10)])],
    );

    expect(diff.removed.map((e) => e.exerciseId)).toEqual([20]);
  });

  // 値が1行も無い＝「セット追加だけして未入力」。空行が1本あるだけでセット数の変化と誤検知しない
  test('全カラムnullのセットは差分の対象にしない', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10)])],
      [card(100, 10, [set(40, 10), set(null, null)])],
    );

    expect(diff.changed).toHaveLength(0);
  });

  test('値が1つも入っていない追加種目は差分に出さない（空のセット列を足しても意味が無い）', () => {
    const diff = buildRoutineDiff([], [card(100, 20, [set(null, null)])]);

    expect(diff.added).toHaveLength(0);
  });

  // ウォームアップ用と本番用でカードを分ける運用。種目idだけで1対1にすると2枚目が漏れる
  // （どのカードと対応付けるかは「同じ種目のカードが複数ある場合の対応付け」を参照）
  test('同じ種目のカードが2枚あるとき、余った方はaddedになる', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10)])],
      [card(100, 10, [set(40, 10)]), card(101, 10, [set(60, 5)])],
    );

    expect(diff.changed).toHaveLength(0);
    expect(diff.added.map((e) => e.key)).toEqual(['session:101']);
  });
});

describe('formatRoutineDiffSummary', () => {
  const empty = { added: [], changed: [], removed: [] };

  test('0件の要素は出さず「・」で連結する', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10)]), routineExercise(2, 30, [set(20, 10)])],
      [card(100, 10, [set(50, 10)]), card(101, 20, [set(30, 12)])],
    );

    expect(formatRoutineDiffSummary(diff)).toBe('追加した種目1件・値の変更1件・未実施の種目1件');
  });

  test('1種類だけならその要素のみ', () => {
    expect(formatRoutineDiffSummary({ ...empty, changed: [{} as never, {} as never, {} as never] })).toBe(
      '値の変更3件',
    );
  });
});

describe('resolveExerciseSets', () => {
  const diff = buildRoutineDiff(
    [routineExercise(1, 10, [set(40, 5), set(40, 5)])],
    [card(100, 10, [set(50, 5), set(50, 5), set(45, 8)])],
  );
  const exercise = diff.changed[0];

  test('全セットにチェックが付いていれば今日の値になる', () => {
    expect(resolveExerciseSets(exercise, selectAll([exercise.key]))).toEqual([set(50, 5), set(50, 5), set(45, 8)]);
  });

  // 子のチェックを外すと親の要約がその場で戻る、を成立させているのがこの分岐
  test('追加セットのチェックを外すとセット数が元に戻る', () => {
    const selection: DiffSelection = { exercises: new Set([exercise.key]), sets: new Map([[exercise.key, new Set([1, 2])]]) };

    expect(resolveExerciseSets(exercise, selection)).toEqual([set(50, 5), set(50, 5)]);
  });

  test('一部のセットだけ外すとその位置だけルーティンの値が残る', () => {
    const selection: DiffSelection = { exercises: new Set([exercise.key]), sets: new Map([[exercise.key, new Set([1, 3])]]) };

    expect(resolveExerciseSets(exercise, selection)).toEqual([set(50, 5), set(40, 5), set(45, 8)]);
  });

  test('削除セットのチェックを外すとそのセットが残る', () => {
    const shrink = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 5), set(40, 8)])],
      [card(100, 10, [set(40, 5)])],
    ).changed[0];
    const selection: DiffSelection = { exercises: new Set([shrink.key]), sets: new Map([[shrink.key, new Set()]]) };

    expect(resolveExerciseSets(shrink, selection)).toEqual([set(40, 5), set(40, 8)]);
  });
});

describe('applyRoutineDiff', () => {
  const routine = [routineExercise(1, 10, [set(40, 5)]), routineExercise(2, 20, [set(30, 12)]), routineExercise(3, 40, [set(10, 20)])];
  const cards = [card(100, 10, [set(50, 5)]), card(101, 40, [set(10, 20)]), card(102, 30, [set(25, 15)])];
  const diff = buildRoutineDiff(routine, cards);

  test('チェック済みの差分だけを反映し、差分の無い種目はそのまま残す', () => {
    const keys = [...diff.added, ...diff.changed, ...diff.removed].map((e) => e.key);

    expect(applyRoutineDiff(routine, diff, selectAll(keys))).toEqual([
      // 値の変更（チェック済み）
      { exerciseId: 10, sets: [set(50, 5)] },
      // 未実施（チェック済み＝削除）なので消える → 20は出てこない
      // 差分の無かった種目はそのまま
      { exerciseId: 40, sets: [set(10, 20)] },
      // 追加した種目は末尾
      { exerciseId: 30, sets: [set(25, 15)] },
    ]);
  });

  test('チェックを全部外すとルーティンは現状のまま', () => {
    const untouched: DiffSelection = { exercises: new Set(), sets: new Map() };

    expect(applyRoutineDiff(routine, diff, untouched)).toEqual([
      { exerciseId: 10, sets: [set(40, 5)] },
      { exerciseId: 20, sets: [set(30, 12)] },
      { exerciseId: 40, sets: [set(10, 20)] },
    ]);
  });

  // 未実施の既定はオフ。チェックしたときだけルーティンから消える
  test('未実施の種目はチェックしたときだけ削除される', () => {
    const removedKey = diff.removed[0].key;
    const onlyRemoved: DiffSelection = { exercises: new Set([removedKey]), sets: new Map() };

    expect(applyRoutineDiff(routine, diff, onlyRemoved).map((e) => e.exerciseId)).toEqual([10, 40]);
  });
});

// weight_reps以外の計測タイプ。sameValuesは4カラムを機械的に比較するので動くはずだが、
// この機能が初めて実データをそのままルーティンへ書き戻す導線になるため明示的に固定する
describe('計測タイプ別', () => {
  function typedRoutine(measurementType: string, sets: Record<string, number | null>[]) {
    return [{ id: 1, exerciseId: 10, name: '種目', category: 'core', measurementType, source: 'preset', slug: null, sets }];
  }
  function typedCard(measurementType: string, sets: Record<string, number | null>[]) {
    return [
      {
        workoutSessionExerciseId: 100,
        exerciseId: 10,
        name: '種目',
        category: 'core',
        measurementType,
        source: 'preset',
        slug: null,
        sets,
      },
    ];
  }

  test('時間のみの種目はdurationSecondsの差だけを拾う', () => {
    const diff = buildRoutineDiff(
      typedRoutine('time', [{ durationSeconds: 60 }]),
      typedCard('time', [{ durationSeconds: 90 }]),
    );

    expect(diff.changed[0].setDiffs).toEqual([
      {
        setNumber: 1,
        kind: 'changed',
        before: { weight: null, reps: null, durationSeconds: 60, distanceMeters: null },
        after: { weight: null, reps: null, durationSeconds: 90, distanceMeters: null },
      },
    ]);
  });

  test('距離＋時間の種目は両方のカラムを見る', () => {
    const same = buildRoutineDiff(
      typedRoutine('distance_time', [{ distanceMeters: 5000, durationSeconds: 1800 }]),
      typedCard('distance_time', [{ distanceMeters: 5000, durationSeconds: 1800 }]),
    );
    expect(same.changed).toHaveLength(0);

    const diff = buildRoutineDiff(
      typedRoutine('distance_time', [{ distanceMeters: 5000, durationSeconds: 1800 }]),
      typedCard('distance_time', [{ distanceMeters: 5000, durationSeconds: 1700 }]),
    );
    expect(diff.changed).toHaveLength(1);
  });

  test('自重（回数のみ）の種目はrepsの差だけを拾う', () => {
    const diff = buildRoutineDiff(typedRoutine('reps', [{ reps: 10 }]), typedCard('reps', [{ reps: 12 }]));

    expect(diff.changed).toHaveLength(1);
  });
});

// 位置ベースの突き合わせの境界。仕様として固定しておく（値としては常に妥当な4カラムの組になる）
describe('セット列の突き合わせ（位置ベース）', () => {
  test('途中のセットを削除して末尾に足すと、削除＋追加ではなく複数の変更として出る', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10), set(50, 8), set(60, 6)])],
      [card(100, 10, [set(40, 10), set(60, 6), set(70, 5)])],
    );

    expect(diff.changed[0].setDiffs).toEqual([
      { setNumber: 2, kind: 'changed', before: set(50, 8), after: set(60, 6) },
      { setNumber: 3, kind: 'changed', before: set(60, 6), after: set(70, 5) },
    ]);
  });

  test('差分の無い位置は選択状態に関わらずそのまま残る', () => {
    const exercise = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 5), set(50, 8)])],
      [card(100, 10, [set(40, 5), set(60, 8)])],
    ).changed[0];
    const noneAccepted: DiffSelection = { exercises: new Set([exercise.key]), sets: new Map([[exercise.key, new Set()]]) };

    expect(resolveExerciseSets(exercise, noneAccepted)).toEqual([set(40, 5), set(50, 8)]);
  });
});

// ウォームアップ用と本番用でカードを分ける運用。表示順の先頭から消費すると、
// ルーティンがウォームアップの重量に下方修正される（しかも既定チェックONで壊れる向き）
describe('同じ種目のカードが複数ある場合の対応付け', () => {
  test('主指標が近いカードと対応付ける（表示順の先頭ではない）', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(100, 5)])],
      // ウォームアップが先に並んでいる
      [card(100, 10, [set(40, 10)]), card(101, 10, [set(100, 5)])],
    );

    // 100kgのカードと対応 → 差分なし。40kgのカードは「追加した種目」になる
    expect(diff.changed).toHaveLength(0);
    expect(diff.added.map((e) => e.key)).toEqual(['session:100']);
  });

  test('ルーティン側にも同じ種目が2エントリあれば、それぞれ近い方と対応する', () => {
    const routine = [routineExercise(1, 10, [set(40, 10)]), routineExercise(2, 10, [set(100, 5)])];
    const diff = buildRoutineDiff(routine, [card(100, 10, [set(45, 10)]), card(101, 10, [set(105, 5)])]);

    expect(diff.added).toHaveLength(0);
    expect(diff.changed.map((e) => e.key)).toEqual(['routine:1', 'routine:2']);
    expect(diff.changed[0].todaySets).toEqual([set(45, 10)]);
    expect(diff.changed[1].todaySets).toEqual([set(105, 5)]);
  });

  test('値の無いカードはルーティン側のスロットを食い潰さない', () => {
    const diff = buildRoutineDiff(
      [routineExercise(1, 10, [set(40, 10)])],
      [card(100, 10, [set(null, null)]), card(101, 10, [set(50, 10)])],
    );

    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].todaySets).toEqual([set(50, 10)]);
  });
});

// 「チェックしたものだけ反映」を守る。目標値を未入力のまま保存された種目は日常的に存在する
// （buildInitialRoutineSetsが履歴の無い種目に空1セットを作る）
describe('触っていない種目のセット行', () => {
  test('全カラムnullのセットしか持たない種目も、そのまま残る', () => {
    const routine = [
      routineExercise(1, 10, [set(40, 5)]),
      { ...routineExercise(2, 20, []), sets: [{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
    ];
    const diff = buildRoutineDiff(routine, [card(100, 10, [set(50, 5)]), card(101, 20, [set(null, null)])]);

    const applied = applyRoutineDiff(routine, diff, selectAll(diff.changed.map((e) => e.key)));

    expect(applied).toEqual([
      { exerciseId: 10, sets: [set(50, 5)] },
      { exerciseId: 20, sets: [set(null, null)] },
    ]);
  });

  test('反映した結果セットが0件になる種目は空1セットに落とす', () => {
    const routine = [routineExercise(1, 10, [set(40, 5)])];
    const diff = buildRoutineDiff(routine, [card(100, 10, [set(null, null)])]);

    // カードに値が無いので「未実施の種目」になる。チェックすると削除、外せば据え置き
    expect(diff.removed).toHaveLength(1);
    expect(applyRoutineDiff(routine, diff, { exercises: new Set(), sets: new Map() })).toEqual([
      { exerciseId: 10, sets: [set(40, 5)] },
    ]);
  });
});
