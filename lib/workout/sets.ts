import { db } from '@/db/client';
import { sets } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

// 種目カードの「セット追加」。setNumberは既存件数の続きから振る（並び順を保持するため）。
// 既存件数の取得とinsertをトランザクションでまとめている。ただしこのアプリはローカル単一クライアントで
// UI側にも連打防止ガード（isMutatingRef）があるため、真の同時実行下でのレース防止まではしていない
export async function addSet(sessionId: number, exerciseId: number) {
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [{ maxSetNumber }] = await tx
      .select({ maxSetNumber: sql<number | null>`max(${sets.setNumber})` })
      .from(sets)
      .where(and(eq(sets.sessionId, sessionId), eq(sets.exerciseId, exerciseId)));
    const nextNumber = (maxSetNumber ?? 0) + 1;
    await tx.insert(sets).values({
      sessionId,
      exerciseId,
      setNumber: nextNumber,
      completedAt: null,
      createdAt: now,
    });
  });
}

// 種目カードの「セット削除」。setNumberが最も大きい（最後に追加された）セットを1件削除する
export async function deleteLastSet(sessionId: number, exerciseId: number) {
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ id: sets.id })
      .from(sets)
      .where(and(eq(sets.sessionId, sessionId), eq(sets.exerciseId, exerciseId)))
      .orderBy(desc(sets.setNumber))
      .limit(1);
    if (!last) return;
    await tx.delete(sets).where(eq(sets.id, last.id));
  });
}

export type SetValues = {
  weight?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
};

// ✓タップ時の即時保存。入力値とcompletedAtを同時に確定させる
export async function saveSet(setId: number, values: SetValues) {
  await db
    .update(sets)
    .set({ ...values, completedAt: Date.now() })
    .where(eq(sets.id, setId));
}

// 完了済みセットを再度編集可能にする（✓の再タップ）。入力値はそのまま残す
export async function reopenSet(setId: number) {
  await db.update(sets).set({ completedAt: null }).where(eq(sets.id, setId));
}
