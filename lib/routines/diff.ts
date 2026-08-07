import { hasAnyValue } from '@/lib/workout/set-values';

/**
 * ルーティン（テンプレート）と、そのルーティンから開始したセッションの実績を突き合わせて
 * 「ルーティンを更新」に出す差分を組み立てる。DBに触らない純粋関数。
 *
 * 差分は3種類で、**すべて種目単位で数える**（サマリーのカードが出す件数と、差分確認画面の
 * 行数を1対1で対応させるため）。1種目の中で3セットの値が変わってセットが1本増えていても、
 * その種目で「値の変更1件」。
 *
 * - 追加した種目 … ルーティンに無い種目をやった
 * - 値の変更 … 値（重量・回数・時間・距離）またはセット数が変わった
 * - 未実施の種目 … ルーティンにあるが今日やらなかった
 */

export type DiffSetValues = {
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// セット単位の差分。セット列は位置（1セット目・2セット目…）で突き合わせる。
// 追加＝ルーティン側に対応する位置が無い、削除＝今日の実績に対応する位置が無い
export type DiffSetKind = 'changed' | 'added' | 'removed';

export type DiffSet = {
  // 1始まりのセット番号。changed/addedは今日の実績側、removedはルーティン側の位置を指す
  setNumber: number;
  kind: DiffSetKind;
  // ルーティン側の値。added では null
  before: DiffSetValues | null;
  // 今日の実績側の値。removed では null
  after: DiffSetValues | null;
};

export type DiffExerciseKind = 'added' | 'changed' | 'removed';

export type DiffExercise = {
  // 行のkey。ルーティン側にあればroutineExerciseId、追加された種目は
  // workoutSessionExerciseIdを使うため、両者が衝突しないよう接頭辞を付ける
  key: string;
  kind: DiffExerciseKind;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  // ルーティンの現在のセット列（addedでは空）
  routineSets: DiffSetValues[];
  // 今日の実績のセット列（removedでは空）
  todaySets: DiffSetValues[];
  // changedのときだけ中身を持つ。added/removedはセット列ごと丸ごとなので個別の内訳を出さない
  setDiffs: DiffSet[];
};

export type RoutineDiff = {
  added: DiffExercise[];
  changed: DiffExercise[];
  removed: DiffExercise[];
};

type RoutineExerciseLike = {
  id: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: Partial<DiffSetValues>[];
};

type SessionCardLike = {
  workoutSessionExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: Partial<DiffSetValues>[];
};

function toValues(s: Partial<DiffSetValues>): DiffSetValues {
  return {
    weight: s.weight ?? null,
    reps: s.reps ?? null,
    durationSeconds: s.durationSeconds ?? null,
    distanceMeters: s.distanceMeters ?? null,
  };
}

// 値が1つも入っていない行は「セット追加だけして未入力のまま終えた」ものなので、
// 差分の対象から外す（lib/routines/validation.tsのhistorySetsToDraftSetsと同じ基準）。
// 除外しないと、空行が1本あるだけで「セット数が変わった」と誤検知する
function toValueSets(sets: Partial<DiffSetValues>[]): DiffSetValues[] {
  return sets.map(toValues).filter(hasAnyValue);
}

function sameValues(a: DiffSetValues, b: DiffSetValues): boolean {
  return (
    a.weight === b.weight &&
    a.reps === b.reps &&
    a.durationSeconds === b.durationSeconds &&
    a.distanceMeters === b.distanceMeters
  );
}

// セット列を位置で突き合わせる。長い方に合わせて走査し、片側にしか無い位置を added/removed にする
function diffSets(routineSets: DiffSetValues[], todaySets: DiffSetValues[]): DiffSet[] {
  const diffs: DiffSet[] = [];
  const length = Math.max(routineSets.length, todaySets.length);
  for (let i = 0; i < length; i++) {
    const before = routineSets[i] ?? null;
    const after = todaySets[i] ?? null;
    if (before == null && after != null) {
      diffs.push({ setNumber: i + 1, kind: 'added', before: null, after });
    } else if (before != null && after == null) {
      diffs.push({ setNumber: i + 1, kind: 'removed', before, after: null });
    } else if (before != null && after != null && !sameValues(before, after)) {
      diffs.push({ setNumber: i + 1, kind: 'changed', before, after });
    }
  }
  return diffs;
}

/**
 * 同じ種目のカードが1セッションに複数ある場合（ウォームアップ用と本番用でカードを分ける運用）は、
 * ルーティン側の同じ種目と**先頭から順に**対応付ける。余ったカードは「追加した種目」になる。
 * 種目idだけで1対1に決め打ちすると、2枚目のカードが常に差分から漏れるか、
 * 1枚目を上書きしてしまうため
 */
export function buildRoutineDiff(
  routineExercises: RoutineExerciseLike[],
  sessionCards: SessionCardLike[],
): RoutineDiff {
  // 種目idごとに、まだ対応付けていないセッションカードのキュー
  const unmatched = new Map<number, SessionCardLike[]>();
  for (const card of sessionCards) {
    const list = unmatched.get(card.exerciseId);
    if (list) list.push(card);
    else unmatched.set(card.exerciseId, [card]);
  }

  const changed: DiffExercise[] = [];
  const removed: DiffExercise[] = [];

  for (const routineExercise of routineExercises) {
    const queue = unmatched.get(routineExercise.exerciseId);
    const card = queue?.shift();
    const routineSets = toValueSets(routineExercise.sets);

    if (!card) {
      removed.push({
        key: `routine:${routineExercise.id}`,
        kind: 'removed',
        exerciseId: routineExercise.exerciseId,
        name: routineExercise.name,
        category: routineExercise.category,
        measurementType: routineExercise.measurementType,
        source: routineExercise.source,
        slug: routineExercise.slug,
        routineSets,
        todaySets: [],
        setDiffs: [],
      });
      continue;
    }

    const todaySets = toValueSets(card.sets);
    const setDiffs = diffSets(routineSets, todaySets);
    if (setDiffs.length === 0) continue;

    changed.push({
      key: `routine:${routineExercise.id}`,
      kind: 'changed',
      exerciseId: routineExercise.exerciseId,
      // 名前などの表示情報はルーティン側・セッション側どちらも同じ種目を指すので、
      // ルーティン側に揃える（種目名が変更されていた場合も一覧内で表記が割れない）
      name: routineExercise.name,
      category: routineExercise.category,
      measurementType: routineExercise.measurementType,
      source: routineExercise.source,
      slug: routineExercise.slug,
      routineSets,
      todaySets,
      setDiffs,
    });
  }

  // ルーティン側と対応付かずに残ったカードが「追加した種目」。セッションの表示順（orderIndex）を
  // 保つため、Mapに残った分をsessionCardsの順で拾い直す
  const leftover = new Set<number>();
  for (const list of unmatched.values()) {
    for (const card of list) leftover.add(card.workoutSessionExerciseId);
  }

  const added: DiffExercise[] = sessionCards
    .filter((card) => leftover.has(card.workoutSessionExerciseId))
    // 値が1つも入っていない種目（追加しただけで実施しなかった）は差分に出さない。
    // ルーティンに空のセット列を足しても意味が無い
    .filter((card) => toValueSets(card.sets).length > 0)
    .map((card) => ({
      key: `session:${card.workoutSessionExerciseId}`,
      kind: 'added' as const,
      exerciseId: card.exerciseId,
      name: card.name,
      category: card.category,
      measurementType: card.measurementType,
      source: card.source,
      slug: card.slug,
      routineSets: [],
      todaySets: toValueSets(card.sets),
      setDiffs: [],
    }));

  return { added, changed, removed };
}

export function diffTotalCount(diff: RoutineDiff): number {
  return diff.added.length + diff.changed.length + diff.removed.length;
}

/**
 * サマリーの「ルーティンを更新」カードの説明文。0件の要素は出さず「・」で連結する
 * （デザイン案③「『{名前}』の内容が変わっています」の本文）。
 */
export function formatRoutineDiffSummary(diff: RoutineDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`追加した種目${diff.added.length}件`);
  if (diff.changed.length > 0) parts.push(`値の変更${diff.changed.length}件`);
  if (diff.removed.length > 0) parts.push(`未実施の種目${diff.removed.length}件`);
  return parts.join('・');
}

export type DiffSelection = {
  // チェックが付いている種目のkey
  exercises: Set<string>;
  // 値の変更のうち、チェックが付いているセットのsetNumber（種目keyごと）。
  // 未登録の種目は「全セットにチェックが付いている」扱い（既定が全部オンのため、
  // ユーザーが一度も触っていない種目のためにSetを持たなくて済む）
  sets: Map<string, Set<number>>;
};

export function isSetAccepted(selection: DiffSelection, exerciseKey: string, setNumber: number): boolean {
  const accepted = selection.sets.get(exerciseKey);
  return accepted ? accepted.has(setNumber) : true;
}

/**
 * 「値の変更」種目が、選択の状態を踏まえて最終的にどのセット列になるかを返す。
 *
 * 差分確認画面の親行の要約（「今日」の行）と、実際にDBへ書き込む値の両方がこれを使う。
 * 子のチェックを外した瞬間に親の要約が戻るのは、同じ関数を通しているため
 * （デザイン案の「外すと要約が2セット→4セットに戻るので影響がその場で分かります」）。
 *
 * 位置ごとに、差分があれば採用/不採用でafter/beforeを選び、差分が無ければルーティンの値を残す。
 */
export function resolveExerciseSets(exercise: DiffExercise, selection: DiffSelection): DiffSetValues[] {
  if (exercise.kind === 'added') return exercise.todaySets;
  if (exercise.kind === 'removed') return exercise.routineSets;

  const diffByPosition = new Map(exercise.setDiffs.map((d) => [d.setNumber, d]));
  const length = Math.max(exercise.routineSets.length, exercise.todaySets.length);
  const result: DiffSetValues[] = [];

  for (let i = 0; i < length; i++) {
    const setNumber = i + 1;
    const diff = diffByPosition.get(setNumber);
    if (!diff) {
      // 差分の無い位置。ルーティン側と今日側が同値なのでどちらを採ってもよい
      const kept = exercise.routineSets[i];
      if (kept) result.push(kept);
      continue;
    }
    const accepted = isSetAccepted(selection, exercise.key, setNumber);
    const value = accepted ? diff.after : diff.before;
    if (value) result.push(value);
  }

  return result;
}

/**
 * 選択された差分だけを反映した、ルーティンの新しい種目リストを組み立てる。
 * 差分に出てこない種目（ルーティン通りだった種目）はそのまま残す。追加した種目は末尾に足す。
 */
export function applyRoutineDiff(
  routineExercises: RoutineExerciseLike[],
  diff: RoutineDiff,
  selection: DiffSelection,
): { exerciseId: number; sets: DiffSetValues[] }[] {
  const changedByRoutineExerciseId = new Map(diff.changed.map((e) => [e.key, e]));
  const removedByRoutineExerciseId = new Map(diff.removed.map((e) => [e.key, e]));

  const result: { exerciseId: number; sets: DiffSetValues[] }[] = [];

  for (const routineExercise of routineExercises) {
    const key = `routine:${routineExercise.id}`;
    const checked = selection.exercises.has(key);

    const removedEntry = removedByRoutineExerciseId.get(key);
    // 「未実施の種目」はチェック＝ルーティンから削除。外れていれば据え置き
    if (removedEntry) {
      if (!checked) result.push({ exerciseId: routineExercise.exerciseId, sets: removedEntry.routineSets });
      continue;
    }

    const changedEntry = changedByRoutineExerciseId.get(key);
    if (changedEntry) {
      const sets = checked
        ? resolveExerciseSets(changedEntry, selection)
        : changedEntry.routineSets;
      result.push({ exerciseId: routineExercise.exerciseId, sets });
      continue;
    }

    // 差分の無かった種目
    result.push({ exerciseId: routineExercise.exerciseId, sets: toValueSets(routineExercise.sets) });
  }

  for (const addedEntry of diff.added) {
    if (selection.exercises.has(addedEntry.key)) {
      result.push({ exerciseId: addedEntry.exerciseId, sets: addedEntry.todaySets });
    }
  }

  return result;
}
