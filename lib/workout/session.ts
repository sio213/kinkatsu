import { db } from '@/db/client';
import { workoutSessionExercises, workoutSessions } from '@/db/schema';
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
  await db
    .update(workoutSessions)
    .set({ endedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(workoutSessions.id, id));
}

// 種目追加ピッカーで選ばれた種目をセッションに追加する。orderIndexは
// このセッションに既に入っている種目の続き番号にする（並び順を保持するため）
export async function addExercisesToSession(sessionId: number, exerciseIds: number[]) {
  if (exerciseIds.length === 0) return;
  const now = Date.now();
  const existing = await db
    .select({ orderIndex: workoutSessionExercises.orderIndex })
    .from(workoutSessionExercises)
    .where(eq(workoutSessionExercises.sessionId, sessionId));
  const startIndex =
    existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 0;
  await db.insert(workoutSessionExercises).values(
    exerciseIds.map((exerciseId, i) => ({
      sessionId,
      exerciseId,
      orderIndex: startIndex + i,
      createdAt: now,
    })),
  );
}
