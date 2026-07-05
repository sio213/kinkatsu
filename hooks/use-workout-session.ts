import { db } from '@/db/client';
import {
  exercises,
  sets,
  workoutSessionExercises,
  workoutSessions,
  type Exercise,
  type Set,
  type WorkoutSession,
} from '@/db/schema';
import type { SessionSummary } from '@/lib/workout/summary';
import { eq, desc, sql, getTableColumns } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

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

export type SessionExercise = Exercise & { orderIndex: number };

// トレーニング中画面に表示する、このセッションに追加済みの種目一覧（並び順つき）
export function useSessionExercises(sessionId: number): SessionExercise[] {
  const { data } = useLiveQuery(
    db
      .select({ ...getTableColumns(exercises), orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
      .where(eq(workoutSessionExercises.sessionId, sessionId))
      .orderBy(workoutSessionExercises.orderIndex),
  );
  return data ?? [];
}

// sessionSets.get(id)がヒットしない種目向けの安定した空配列参照。
// 呼び出し側で `?? []` すると毎レンダー新しい配列になりSessionExerciseCardのmemoが効かなくなるため、
// これを使ってもらう
export const EMPTY_SETS: Set[] = [];

// セット入力画面用。セッション内の全setsを一度だけ購読し、種目IDごとにJS側でグルーピングする
// （種目カードの数だけlive queryを張ると数が増えるほど無駄が増えるため、useSessionStatsと同じ方針）。
// トレーニング中画面は経過時間タイマーで毎秒再レンダーされるため、liveQueryのdataが変わらない限り
// 同じMap参照を返すようuseMemoでグルーピング結果をキャッシュする
export function useSessionSets(sessionId: number): Map<number, Set[]> {
  const { data } = useLiveQuery(
    db.select().from(sets).where(eq(sets.sessionId, sessionId)).orderBy(sets.setNumber),
  );
  return useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const row of data ?? []) {
      const list = map.get(row.exerciseId);
      if (list) {
        list.push(row);
      } else {
        map.set(row.exerciseId, [row]);
      }
    }
    return map;
  }, [data]);
}
