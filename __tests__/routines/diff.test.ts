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
  test('同じ種目のカードが2枚ある場合は先頭から順に対応付け、余りをaddedにする', () => {
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
