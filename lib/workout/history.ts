import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PreviousSetValues = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// 種目の「前回の記録」を取得する。同じ種目が1セッション内に複数カード（ウォームアップ用＋本番用等）で
// 追加できる仕様のため、セッション単位ではなくカード（workoutSessionExercises）単位で直近の1枚を
// 特定してから、そのカードのセット列を返す。✓未確定（completedAt null）のセットは前回の下書きを
// 引き継がないよう対象から除外する。excludeSessionIdには呼び出し元の（今まさに種目を追加している）
// セッションを渡し、自分自身を「前回」として参照しないようにする。
export async function getPreviousSets(
  tx: Tx,
  exerciseId: number,
  excludeSessionId: number,
): Promise<PreviousSetValues[]> {
  const [latestCard] = await tx
    .select({ workoutSessionExerciseId: sets.workoutSessionExerciseId })
    .from(sets)
    .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
    .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sets.exerciseId, exerciseId),
        isNotNull(sets.completedAt),
        ne(workoutSessionExercises.sessionId, excludeSessionId),
      ),
    )
    // 同じ過去セッション内に同じ種目のカードが複数あるケース（ウォームアップ/本番等）の
    // タイブレークとしてカードid降順（＝そのセッション内で後から追加されたカード）も見る
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessionExercises.id))
    .limit(1);

  if (!latestCard) return [];

  return tx
    .select({
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
    })
    .from(sets)
    .where(
      and(
        eq(sets.workoutSessionExerciseId, latestCard.workoutSessionExerciseId),
        isNotNull(sets.completedAt),
      ),
    )
    .orderBy(sets.setNumber);
}
