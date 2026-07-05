import { db } from '@/db/client';
import { sets, workoutSessions, type WorkoutSession } from '@/db/schema';
import { endWorkoutSession, startWorkoutSession } from '@/lib/workout/session';
import { eq, desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export function useWorkoutSessions() {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).orderBy(desc(workoutSessions.startedAt)),
  );
  // 個人の記録アプリなのでセッション件数は小規模想定。全件取得しJS側で集計する
  // （hooks/use-reminders.tsなど既存フックと同じ方針）
  const { data: allSets } = useLiveQuery(db.select().from(sets));

  const sessions: WorkoutSession[] = data ?? [];
  // endedAtがnullのセッションは常に高々1件のはずだが、配列順（startedAt降順）で
  // 先頭に見つかったもの＝最も新しく開始したものをactiveSessionとする
  const activeSession = sessions.find((s) => s.endedAt == null) ?? null;

  return {
    sessions,
    activeSession,
    sets: allSets ?? [],
    startSession: startWorkoutSession,
    endSession: endWorkoutSession,
  };
}

// トレーニング中画面など、単一セッションの購読とendSessionだけが必要な場面用。
// useWorkoutSessions()と違い全sessions/全setsのlive queryを張らないため、
// セット書き込みが増えても不要な再レンダーが起きない
export function useWorkoutSession(id: number) {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).limit(1),
  );
  return { session: data?.[0], loaded: data !== undefined };
}
