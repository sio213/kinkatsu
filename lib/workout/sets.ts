import { db } from '@/db/client';
import { sets } from '@/db/schema';
import type { SetFieldKey } from '@/lib/workout/set-format';
import { desc, eq } from 'drizzle-orm';

export type SetValues = Partial<Record<SetFieldKey, number | null>>;

// 種目カードの「セット追加」。setNumberは既存件数の続きから振り、直前セットの重量・回数・
// 時間・距離をコピーする（同じ重量で複数セット組むことが多いため）。overrideValuesを渡すと、
// DB上の直前セット行の代わりにそちらをコピー元にする（✓未タップの入力途中の値をコピーしたい場合用。
// 呼び出し側のSessionExerciseCard参照）。
// sessionId/exerciseIdはsessionExerciseIdから引ければ本来不要だが、呼び出し側が両方持っているため
// 素直に受け取っている（3つの整合性は呼び出し側の責任）。取得とinsertはトランザクションでまとめているが、
// ローカル単一クライアント+UI側の連打防止ガードが前提で、真の同時実行下でのレース防止はしていない
export async function addSet(
  sessionId: number,
  exerciseId: number,
  sessionExerciseId: number,
  overrideValues?: SetValues,
) {
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({
        setNumber: sets.setNumber,
        weight: sets.weight,
        reps: sets.reps,
        durationSeconds: sets.durationSeconds,
        distanceMeters: sets.distanceMeters,
      })
      .from(sets)
      .where(eq(sets.workoutSessionExerciseId, sessionExerciseId))
      .orderBy(desc(sets.setNumber))
      .limit(1);
    const nextNumber = (last?.setNumber ?? 0) + 1;
    const source = overrideValues ?? last ?? {};
    await tx.insert(sets).values({
      sessionId,
      exerciseId,
      workoutSessionExerciseId: sessionExerciseId,
      setNumber: nextNumber,
      weight: source.weight ?? null,
      reps: source.reps ?? null,
      durationSeconds: source.durationSeconds ?? null,
      distanceMeters: source.distanceMeters ?? null,
      completedAt: null,
      createdAt: now,
    });
  });
}

// 種目カードの「セット削除」。setNumberが最も大きい（最後に追加された）セットを1件削除する
export async function deleteLastSet(sessionExerciseId: number) {
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ id: sets.id })
      .from(sets)
      .where(eq(sets.workoutSessionExerciseId, sessionExerciseId))
      .orderBy(desc(sets.setNumber))
      .limit(1);
    if (!last) return;
    await tx.delete(sets).where(eq(sets.id, last.id));
  });
}

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
