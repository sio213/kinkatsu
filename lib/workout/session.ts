import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { getPreviousSets, type PreviousSetValues } from '@/lib/workout/history';
import { eq } from 'drizzle-orm';

// 種目カードが新規追加/入れ替えされたことを呼び出し側（画面）に伝える情報。
// kindは新規追加(常にリスト末尾に増える)か種目入れ替え(既存カードの位置のまま)かを表し、
// 新規追加時だけ最初の入力欄にオートフォーカスする、といった出し分けに使う。
// prefilledSetIdsは、前回の記録から実際に値をコピーして挿入したセットのidの一覧
// （前回の記録が無く空の1件だけを作った場合は空配列）。ゴースト表示（値はあるが✓未確定の行の
// 見た目）は、このidに含まれる行だけに適用する。「セット追加」ボタンで後から足された行など、
// プリフィルと無関係な行まで対象にしないための精度担保
export type PrefilledCard = {
  sessionId: number;
  exerciseId: number;
  sessionExerciseId: number;
  kind: 'new' | 'swap' | 'history';
  prefilledSetIds: number[];
};

// 種目カードに最初から入っている、値が空の1セット目。前回の記録が見つからない種目の
// フォールバックとして使う
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

// 4つの値カラムのいずれかに実際の値が入っているか。前回セットが✓未確定のまま
// 何も入力せずに終えたセッションの場合、getPreviousSetsは全カラムnullの行を返しうる。
// そのような行までprefilledSetIdsに含めると、値の無い行が背景色だけゴースト表示される
// （中身が空なのに「前回の値がある」ように見える）ため、実際に値がある行だけに絞る
function hasAnyValue(s: PreviousSetValues): boolean {
  return s.weight != null || s.reps != null || s.durationSeconds != null || s.distanceMeters != null;
}

// 実際に挿入したセットのうち、コピー元(sourceSets)に値があった行のidだけを残す。
// addExercisesToSession/replaceSessionExercise/loadHistoryIntoSessionExerciseの3箇所で
// 同じ絞り込みが必要なため共通化する
function computePrefilledSetIds(insertedIds: number[], sourceSets: PreviousSetValues[]): number[] {
  if (sourceSets.length === 0) return [];
  return insertedIds.filter((_, idx) => hasAnyValue(sourceSets[idx]));
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
  // setNumberはコピー元の値をそのまま使わず1から振り直す。コピー元の並び（setNumber昇順）は
  // previousSetsのソート順として活かしつつ、新しいカードの番号はここで完結させることで、
  // コピー元のsetNumberが何らかの理由で1から始まっていない場合でも新カードは必ず1,2,3...になる
  return previousSets.map((s, index) => ({
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    setNumber: index + 1,
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
// 過去にその種目をやったことがあれば前回のセット列（値・セット数とも）を自動で挿入する。
// 呼び出し側（画面）が最初の入力欄へのオートフォーカス・ゴースト表示に使えるよう、
// 前回の記録の有無に関わらず追加した全カードの情報を返す
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
    const result: PrefilledCard[] = [];
    const initialSetsByCard: ReturnType<typeof buildInitialSets>[] = [];
    const previousSetsByCard: PreviousSetValues[][] = [];
    for (const wse of inserted) {
      const previousSets = await getPreviousSets(tx, wse.exerciseId, sessionId);
      previousSetsByCard.push(previousSets);
      result.push({
        sessionId,
        exerciseId: wse.exerciseId,
        sessionExerciseId: wse.id,
        kind: 'new',
        prefilledSetIds: [],
      });
      initialSetsByCard.push(buildInitialSets(sessionId, wse.exerciseId, wse.id, now, previousSets));
    }
    const insertedSets = await tx.insert(sets).values(initialSetsByCard.flat()).returning({ id: sets.id });

    // insertedSetsはinitialSetsByCardをflattenした順序のまま返るため、各カードのセット数だけ
    // 先頭から切り出せば、そのカードに実際に挿入されたセットidが分かる。前回の記録が無いカードは
    // previousSetsByCard[i]が空のため、cardSetIdsは（freshSetValuesの1件のみで）prefilledSetIdsに
    // 含めない
    let cursor = 0;
    for (let i = 0; i < result.length; i++) {
      const cardSetCount = initialSetsByCard[i].length;
      const cardSetIds = insertedSets.slice(cursor, cursor + cardSetCount).map((s) => s.id);
      cursor += cardSetCount;
      result[i].prefilledSetIds = computePrefilledSetIds(cardSetIds, previousSetsByCard[i]);
    }
    return result;
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
    const insertedSets = await tx
      .insert(sets)
      .values(buildInitialSets(wse.sessionId, newExerciseId, sessionExerciseId, now, previousSets))
      .returning({ id: sets.id });

    return {
      sessionId: wse.sessionId,
      exerciseId: newExerciseId,
      sessionExerciseId,
      kind: 'swap',
      prefilledSetIds: computePrefilledSetIds(insertedSets.map((s) => s.id), previousSets),
    };
  });
}

// 「取り消す」で元に戻せるよう、読み込み直前のセット列をそのまま保持するスナップショット
export type SetSnapshot = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completedAt: number | null;
};

// 「過去の記録から読み込む」画面で選んだ過去のカード（historyWorkoutSessionExerciseId）の
// セット列を、このカード（sessionExerciseId）にコピーする。既存のセットは全て削除するが、
// 誤操作時に元へ戻せるよう削除前の状態をSetSnapshotとして返す。completedAtは常にnull（✓は
// 自動タップしない。ghost表示にしてユーザーに確認させる方針はプリフィルと同じ）
export async function loadHistoryIntoSessionExercise(
  sessionExerciseId: number,
  historyWorkoutSessionExerciseId: number,
): Promise<{ prefilledSetIds: number[]; previousSnapshot: SetSnapshot[] }> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ sessionId: workoutSessionExercises.sessionId, exerciseId: workoutSessionExercises.exerciseId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse) return { prefilledSetIds: [], previousSnapshot: [] };

    const previousSnapshot: SetSnapshot[] = await tx
      .select({
        setNumber: sets.setNumber,
        weight: sets.weight,
        reps: sets.reps,
        durationSeconds: sets.durationSeconds,
        distanceMeters: sets.distanceMeters,
        completedAt: sets.completedAt,
      })
      .from(sets)
      .where(eq(sets.workoutSessionExerciseId, sessionExerciseId))
      .orderBy(sets.setNumber);

    const historySets = await getPreviousSetsForCard(tx, historyWorkoutSessionExerciseId);

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    const insertedSets = await tx
      .insert(sets)
      .values(buildInitialSets(wse.sessionId, wse.exerciseId, sessionExerciseId, now, historySets))
      .returning({ id: sets.id });

    return {
      prefilledSetIds: computePrefilledSetIds(insertedSets.map((s) => s.id), historySets),
      previousSnapshot,
    };
  });
}

// loadHistoryIntoSessionExerciseの取り消し。読み込み直前のSetSnapshotへ丸ごと復元する
// （読み込みで新しく採番されたセットidはそのまま破棄し、復元後の行は新しいidを振り直す。
// SetRowはid単位でキー管理しているだけで連続性は要求しないため問題ない）
export async function undoLoadHistory(
  sessionExerciseId: number,
  previousSnapshot: SetSnapshot[],
): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ sessionId: workoutSessionExercises.sessionId, exerciseId: workoutSessionExercises.exerciseId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse) return;

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));

    const rows =
      previousSnapshot.length > 0
        ? previousSnapshot.map((s) => ({
            sessionId: wse.sessionId,
            exerciseId: wse.exerciseId,
            workoutSessionExerciseId: sessionExerciseId,
            setNumber: s.setNumber,
            weight: s.weight,
            reps: s.reps,
            durationSeconds: s.durationSeconds,
            distanceMeters: s.distanceMeters,
            completedAt: s.completedAt,
            createdAt: now,
          }))
        : [freshSetValues(wse.sessionId, wse.exerciseId, sessionExerciseId, now)];

    await tx.insert(sets).values(rows);
  });
}

// 特定の過去カード（workoutSessionExerciseId）のセット列をそのまま返す。getPreviousSets
// （種目単位で直近の1枚を自動で特定する）と違い、こちらは「記録から読み込む」画面で
// ユーザーが選んだカードそのものを対象にする
async function getPreviousSetsForCard(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workoutSessionExerciseId: number,
): Promise<PreviousSetValues[]> {
  return tx
    .select({
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
    })
    .from(sets)
    .where(eq(sets.workoutSessionExerciseId, workoutSessionExerciseId))
    .orderBy(sets.setNumber);
}
