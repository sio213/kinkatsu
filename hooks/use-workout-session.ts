import { db } from '@/db/client';
import { sets, workoutSessions, type WorkoutSession } from '@/db/schema';
import type { SessionSummary } from '@/lib/workout/summary';
import { eq, desc, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

// セッションの一覧・進行中判定のみを担う（セット集計は useSessionStats に分離）
export function useWorkoutSessions() {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).orderBy(desc(workoutSessions.startedAt)),
  );

  const sessions: WorkoutSession[] = data ?? [];
  // endedAtがnullのセッションは常に高々1件のはずだが、配列順（startedAt降順）で
  // 先頭に見つかったもの＝最も新しく開始したものをactiveSessionとする
  const activeSession = sessions.find((s) => s.endedAt == null) ?? null;

  return { sessions, activeSession };
}

// トレーニング中画面など、単一セッションの購読だけが必要な場面用。
// useWorkoutSessions()と違い全sessionsのlive queryを張らないため、
// 他セッションの更新で不要な再レンダーが起きない
export function useWorkoutSession(id: number) {
  const { data } = useLiveQuery(
    db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).limit(1),
  );
  return { session: data?.[0], loaded: data !== undefined };
}

// 記録タブの履歴一覧用。setsは記録の度に増え続ける実データなので、
// 全件をJSへ引き上げてから集計するのではなくSQL側でセッションごとにSUM/COUNTする
export function useSessionStats(): Map<number, SessionSummary> {
  const { data } = useLiveQuery(
    db
      .select({
        sessionId: sets.sessionId,
        setCount: sql<number>`count(*)`,
        totalVolume: sql<number>`coalesce(sum(${sets.weight} * ${sets.reps}), 0)`,
      })
      .from(sets)
      .groupBy(sets.sessionId),
  );
  return new Map(
    (data ?? []).map((row) => [row.sessionId, { setCount: row.setCount, totalVolume: row.totalVolume }]),
  );
}

// トレーニング中画面の終了確認（セット0件かどうか）用。行の中身は使わないため件数のみ取得する
export function useSessionSetCount(sessionId: number): number {
  const { data } = useLiveQuery(
    db
      .select({ count: sql<number>`count(*)` })
      .from(sets)
      .where(eq(sets.sessionId, sessionId)),
  );
  return data?.[0]?.count ?? 0;
}
