import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { getPreviousSets, type PreviousSetValues } from '@/lib/workout/history';
import { and, eq, isNull } from 'drizzle-orm';

// 前回この種目をやったカードを特定できた場合の識別情報。呼び出し側（画面）が
// 「このカードは前回の値をプリフィルした」ことを種目カード側に伝え、未確認の行が
// 残っている間だけ「クリア」導線を出すのに使う。
// kindは新規追加(常にリスト末尾に増える)か種目入れ替え(既存カードの位置のまま)かを表し、
// 呼び出し側が「新規追加時だけ一覧の末尾までスクロールする」といった出し分けに使う
export type PrefilledCard = {
  sessionId: number;
  exerciseId: number;
  sessionExerciseId: number;
  kind: 'new' | 'swap';
};

// 種目カードに最初から入っている、値が空の1セット目。前回の記録が見つからない種目の
// フォールバックとして使う（従来はこれが常に使われていた）。プリフィル分岐（下記buildInitialSets）と
// 同じキー構成にしておく（weight等を省略すると、複数種目を同時追加してプリフィルあり/なしが
// 混在した際にinsertされる行のシェイプが揃わなくなるため）
function freshSetValues(sessionId: number, exerciseId: number, workoutSessionExerciseId: number, now: number) {
  return {
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    setNumber: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: null,
    createdAt: now,
  };
}

// 前回のセット列をコピーして初期セットを作る。前回の記録が無ければfreshSetValuesにフォールバックする。
// completedAtは常にnull（✓は自動タップしない。ユーザーが確認して初めて確定させる）
function buildInitialSets(
  sessionId: number,
  exerciseId: number,
  workoutSessionExerciseId: number,
  now: number,
  previousSets: PreviousSetValues[],
) {
  if (previousSets.length === 0) {
    return [freshSetValues(sessionId, exerciseId, workoutSessionExerciseId, now)];
  }
  return previousSets.map((s) => ({
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    setNumber: s.setNumber,
    weight: s.weight,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
    completedAt: null,
    createdAt: now,
  }));
}

export async function startWorkoutSession() {
  const now = Date.now();
  const [inserted] = await db
    .insert(workoutSessions)
    .values({ startedAt: now, createdAt: now, updatedAt: now })
    .returning();
  return inserted;
}

export async function endWorkoutSession(id: number) {
  const now = Date.now();
  await db
    .update(workoutSessions)
    .set({ endedAt: now, updatedAt: now })
    .where(eq(workoutSessions.id, id));
}

// 種目追加ピッカーで選ばれた種目をセッションに追加する。orderIndexは
// このセッションに既に入っている種目の続き番号にする（並び順を保持するため）。
// 既存件数の取得と採番をトランザクションでまとめ、同時呼び出しでのorderIndex重複を防ぐ。
// 過去にその種目をやったことがあれば前回のセット列（値・セット数とも）を自動で挿入し、
// 呼び出し側が「クリア」導線の表示に使えるようプリフィルされたカードの一覧を返す
export async function addExercisesToSession(
  sessionId: number,
  exerciseIds: number[],
): Promise<PrefilledCard[]> {
  if (exerciseIds.length === 0) return [];
  const now = Date.now();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.sessionId, sessionId));
    const startIndex =
      existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 0;
    const inserted = await tx
      .insert(workoutSessionExercises)
      .values(
        exerciseIds.map((exerciseId, i) => ({
          sessionId,
          exerciseId,
          orderIndex: startIndex + i,
          createdAt: now,
        })),
      )
      .returning();

    // 同一トランザクション内でクエリを並列発行すると競合しうるため、種目ごとに直列でawaitする
    // （並列化してもメリットが薄い一方、順序が保証されなくなるデメリットの方が大きい）
    const prefilled: PrefilledCard[] = [];
    const initialSetsByCard: ReturnType<typeof buildInitialSets>[] = [];
    for (const wse of inserted) {
      const previousSets = await getPreviousSets(tx, wse.exerciseId, sessionId);
      if (previousSets.length > 0) {
        prefilled.push({ sessionId, exerciseId: wse.exerciseId, sessionExerciseId: wse.id, kind: 'new' });
      }
      initialSetsByCard.push(buildInitialSets(sessionId, wse.exerciseId, wse.id, now, previousSets));
    }
    await tx.insert(sets).values(initialSetsByCard.flat());
    return prefilled;
  });
}

// 種目カードの「⋮」メニューの「削除」。sets側はworkoutSessionExerciseIdにonDelete cascadeが
// 張られているため、このカード（workoutSessionExercises行）を消せば記録済みセットも連動して消える
export async function removeExerciseFromSession(sessionExerciseId: number) {
  await db.delete(workoutSessionExercises).where(eq(workoutSessionExercises.id, sessionExerciseId));
}

// 記録編集画面「⋮」メニューの「削除」。workoutSessionExercises/setsとも
// sessionIdにonDelete cascadeが張られているため、このセッション行を消せば
// 種目・セットもすべて連動して消える
export async function deleteSession(sessionId: number) {
  await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
}

// 種目カードの「⋮」メニューの「上へ移動」「下へ移動」。orderIndexにユニーク制約は無いため、
// 隣接する2行のorderIndexを単純に入れ替えるだけで並び順を反映できる
export async function swapExerciseOrder(sessionExerciseId: number, targetSessionExerciseId: number) {
  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({ orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    const [b] = await tx
      .select({ orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, targetSessionExerciseId));
    if (!a || !b) return;
    await tx
      .update(workoutSessionExercises)
      .set({ orderIndex: b.orderIndex })
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    await tx
      .update(workoutSessionExercises)
      .set({ orderIndex: a.orderIndex })
      .where(eq(workoutSessionExercises.id, targetSessionExerciseId));
  });
}

// 種目カードの「⋮」メニューの「種目を入れ替え」。既存のswapExerciseOrder（並び順の入れ替え）と
// 名前が紛らわしくならないよう、こちらは種目そのものの置換であることが分かる名前にしている。
// 入れ替え後は種目追加ピッカーで新規に種目を追加した直後と同じ状態にする方針のため、
// 既存のセットは計測タイプの一致有無に関わらずすべて削除し、入れ替え先の種目に前回の記録が
// あればそのセット列を、無ければ値が空でsetNumber=1のセットを1件だけ作り直す
// （addExercisesToSessionの自動生成ロジックと同じ形）
export async function replaceSessionExercise(
  sessionExerciseId: number,
  newExerciseId: number,
): Promise<PrefilledCard | null> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ exerciseId: workoutSessionExercises.exerciseId, sessionId: workoutSessionExercises.sessionId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse || wse.exerciseId === newExerciseId) return null;

    await tx
      .update(workoutSessionExercises)
      .set({ exerciseId: newExerciseId })
      .where(eq(workoutSessionExercises.id, sessionExerciseId));

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    const previousSets = await getPreviousSets(tx, newExerciseId, wse.sessionId);
    await tx
      .insert(sets)
      .values(buildInitialSets(wse.sessionId, newExerciseId, sessionExerciseId, now, previousSets));

    return previousSets.length > 0
      ? { sessionId: wse.sessionId, exerciseId: newExerciseId, sessionExerciseId, kind: 'swap' }
      : null;
  });
}

// 種目カードの「前回の値をクリア」。プリフィルされた（＝まだ✓未確定の）セットだけを取り除く。
// ユーザーがどれかのセットを✓確定していた場合、その記録は「クリア」の対象ではない実際の
// 記録なので消してはいけない（無条件に全消去すると確定済みの記録まで失われてしまう）。
// 結果的に1件も残らなければ、種目追加直後と同じ値が空でsetNumber=1のセット1件を作り直す
export async function clearPrefill({
  sessionId,
  exerciseId,
  sessionExerciseId,
}: Pick<PrefilledCard, 'sessionId' | 'exerciseId' | 'sessionExerciseId'>) {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .delete(sets)
      .where(and(eq(sets.workoutSessionExerciseId, sessionExerciseId), isNull(sets.completedAt)));
    const remaining = await tx
      .select({ id: sets.id })
      .from(sets)
      .where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    if (remaining.length === 0) {
      await tx.insert(sets).values(freshSetValues(sessionId, exerciseId, sessionExerciseId, now));
    }
  });
}
