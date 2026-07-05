import { db } from '@/db/client';
import { sets, workoutSessions, type WorkoutSession } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback } from 'react';

export function useWorkoutSessions() {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).orderBy(desc(workoutSessions.startedAt)),
  );
  // 個人の記録アプリなのでセッション件数は小規模想定。全件取得しJS側で集計する
  // （hooks/use-reminders.tsなど既存フックと同じ方針）
  const { data: allSets } = useLiveQuery(db.select().from(sets));

  const sessions: WorkoutSession[] = data ?? [];
  // endedAtがnullのセッションは常に高々1件（中断・再開の対象）
  const activeSession = sessions.find((s) => s.endedAt == null) ?? null;

  const startSession = useCallback(async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(workoutSessions)
      .values({ startedAt: now, createdAt: now, updatedAt: now })
      .returning();
    return inserted;
  }, []);

  const endSession = useCallback(async (id: number) => {
    await db
      .update(workoutSessions)
      .set({ endedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(workoutSessions.id, id));
  }, []);

  return {
    sessions,
    activeSession,
    sets: allSets ?? [],
    startSession,
    endSession,
  };
}

export function useWorkoutSession(id: number) {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).limit(1),
  );
  return { session: data?.[0], loaded: data !== undefined };
}
