import { db } from '@/db/client';
import { workoutSessions } from '@/db/schema';
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
