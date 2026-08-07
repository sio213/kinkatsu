import { resolveMeasurementType, type MeasurementType } from '@/lib/exercises/constants';
import { pickRepresentativeSet, primaryMetric } from '@/lib/workout/set-format';
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

// 同じ種目のカードが1セッションに複数ある場合（ウォームアップ用と本番用でカードを分ける運用）に、
// ルーティン側のどのカードと対応付けるかを決める。**主指標が最も近いカード**を選ぶ。
//
// 表示順の先頭から順に消費すると、ウォームアップを上に並べている人のルーティンが
// ウォームアップの重量に下方修正される（しかも既定チェックONで壊れる向き、@reviewer指摘）。
// 主指標で寄せれば、ルーティンの「100kg×5」は同じ100kg付近のカードと対応する
function pickClosestCard<T extends { sets: DiffSetValues[] }>(
  measurementType: MeasurementType,
  routineSets: DiffSetValues[],
  candidates: T[],
): T | undefined {
  if (candidates.length <= 1) return candidates[0];
  const target = representativePrimary(measurementType, routineSets);
  if (target == null) return candidates[0];

  let best = candidates[0];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const primary = representativePrimary(measurementType, candidate.sets);
    // 主指標が取れないカードは比較できないので、他に候補がある限り選ばない
    const distance = primary == null ? Infinity : Math.abs(primary - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function representativePrimary(measurementType: MeasurementType, sets: DiffSetValues[]): number | null {
  const best = pickRepresentativeSet(measurementType, sets);
  return best ? primaryMetric(measurementType, best) : null;
}

/**
 * ルーティンのテンプレートと今日の実績を突き合わせて差分を組み立てる。
 */
export function buildRoutineDiff(
  routineExercises: RoutineExerciseLike[],
  sessionCards: SessionCardLike[],
): RoutineDiff {
  // 種目idごとに、まだ対応付けていないセッションカード。値が1つも入っていないカード
  // （追加しただけで実施しなかった）は、ルーティン側のスロットを食い潰さないよう最初から除く
  const unmatched = new Map<number, { card: SessionCardLike; sets: DiffSetValues[] }[]>();
  for (const card of sessionCards) {
    const sets = toValueSets(card.sets);
    if (sets.length === 0) continue;
    const entry = { card, sets };
    const list = unmatched.get(card.exerciseId);
    if (list) list.push(entry);
    else unmatched.set(card.exerciseId, [entry]);
  }

  const changed: DiffExercise[] = [];
  const removed: DiffExercise[] = [];

  for (const routineExercise of routineExercises) {
    const routineSets = toValueSets(routineExercise.sets);
    const candidates = unmatched.get(routineExercise.exerciseId) ?? [];
    const measurementType = resolveMeasurementType(routineExercise.measurementType);
    const matched = pickClosestCard(measurementType, routineSets, candidates);
    if (matched) candidates.splice(candidates.indexOf(matched), 1);

    if (!matched) {
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

    const todaySets = matched.sets;
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
    for (const entry of list) leftover.add(entry.card.workoutSessionExerciseId);
  }

  const added: DiffExercise[] = sessionCards
    .filter((card) => leftover.has(card.workoutSessionExerciseId))
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

  // 注意: 位置ごとの採否を混在させると、結果に同じ値のセットが並ぶことがある
  // （ルーティン[A,B,C,D]／今日[A,C]で「3セット目の削除」だけ外すと[A,C,C]）。
  // 実運用ではセット数の増減が末尾で起きるため表面化しにくいので、割り切っている
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
// セット列が空になった種目は、空1セットに落とす。0セットのまま保存できてしまうと
// ルーティンの種目行が「0セット」表示になり、種目追加ピッカー経由（buildInitialRoutineSets）の
// 「実績が無ければ空1セット」と食い違う（lib/routines/validation.tsと同じ扱い）
const EMPTY_SET: DiffSetValues = { weight: null, reps: null, durationSeconds: null, distanceMeters: null };
function withFallback(sets: DiffSetValues[]): DiffSetValues[] {
  return sets.length > 0 ? sets : [EMPTY_SET];
}

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
      if (!checked) result.push({ exerciseId: routineExercise.exerciseId, sets: withFallback(removedEntry.routineSets) });
      continue;
    }

    const changedEntry = changedByRoutineExerciseId.get(key);
    if (changedEntry) {
      const sets = checked ? resolveExerciseSets(changedEntry, selection) : changedEntry.routineSets;
      result.push({ exerciseId: routineExercise.exerciseId, sets: withFallback(sets) });
      continue;
    }

    // 差分の無かった種目＝ユーザーが一切触っていない種目。toValueSetsを通すと
    // 目標値を未入力のまま保存された空セット行が黙って消えるため、そのまま写す
    // （「チェックしたものだけ反映」を守る。@reviewer Major指摘）
    result.push({ exerciseId: routineExercise.exerciseId, sets: routineExercise.sets.map(toValues) });
  }

  for (const addedEntry of diff.added) {
    if (selection.exercises.has(addedEntry.key)) {
      result.push({ exerciseId: addedEntry.exerciseId, sets: withFallback(addedEntry.todaySets) });
    }
  }

  return result;
}
