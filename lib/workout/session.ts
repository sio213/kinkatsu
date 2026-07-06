import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
// 既存件数の取得と採番をトランザクションでまとめ、同時呼び出しでのorderIndex重複を防ぐ
export async function addExercisesToSession(sessionId: number, exerciseIds: number[]) {
  if (exerciseIds.length === 0) return;
  const now = Date.now();
  await db.transaction(async (tx) => {
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
    // 種目追加直後にセットが1件も無いと入力を始めにくいため、カードごとに値が空のセットを1件自動生成する
    await tx.insert(sets).values(
      inserted.map((wse) => ({
        sessionId,
        exerciseId: wse.exerciseId,
        workoutSessionExerciseId: wse.id,
        setNumber: 1,
        completedAt: null,
        createdAt: now,
      })),
    );
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
// 既存のセットは計測タイプの一致有無に関わらずすべて削除し、値が空でsetNumber=1の
// セットを1件だけ作り直す（addExercisesToSessionの自動生成ロジックと同じ形）
export async function replaceSessionExercise(sessionExerciseId: number, newExerciseId: number) {
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ exerciseId: workoutSessionExercises.exerciseId, sessionId: workoutSessionExercises.sessionId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse || wse.exerciseId === newExerciseId) return;

    await tx
      .update(workoutSessionExercises)
      .set({ exerciseId: newExerciseId })
      .where(eq(workoutSessionExercises.id, sessionExerciseId));

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    await tx.insert(sets).values({
      sessionId: wse.sessionId,
      exerciseId: newExerciseId,
      workoutSessionExerciseId: sessionExerciseId,
      setNumber: 1,
      completedAt: null,
      createdAt: now,
    });
  });
}
