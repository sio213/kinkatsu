import { db } from '@/db/client';
import {
  exercises,
  routines,
  sets,
  workoutSessionExercises,
  workoutSessions,
  type Exercise,
  type Set,
  type WorkoutSession,
} from '@/db/schema';
import type { SessionSummary } from '@/lib/workout/summary';
import { and, eq, desc, isNotNull, ne, sql, getTableColumns } from 'drizzle-orm';
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
// 全件をJSへ引き上げてから集計するのではなくSQL側でセッションごとにSUM/COUNTする。
// setCount/totalVolumeとも、✓未タップの自動保存中の値（completedAtがnull。種目追加直後の
// 空セットや、入力途中でアプリを離れた場合の下書き）を含めず、実際に✓で確定したセットのみを
// 集計する（そうしないと種目を追加・入力しただけで記録件数・総重量が水増しされる）
export function useSessionStats(): Map<number, SessionSummary> {
  const { data } = useLiveQuery(
    db
      .select({
        sessionId: sets.sessionId,
        setCount: sql<number>`sum(case when ${sets.completedAt} is not null then 1 else 0 end)`,
        totalVolume: sql<number>`coalesce(sum(case when ${sets.completedAt} is not null then ${sets.weight} * ${sets.reps} else 0 end), 0)`,
      })
      .from(sets)
      .groupBy(sets.sessionId),
  );
  return new Map(
    (data ?? []).map((row) => [row.sessionId, { setCount: row.setCount, totalVolume: row.totalVolume }]),
  );
}

// トレーニング中画面の終了確認（何かセットを記録済みかどうか）用。行の中身は使わないため件数のみ取得する。
// 種目追加直後の自動生成セット（completedAtがnull）は「まだ記録していない」に含めるため、
// ✓で確定したセットのみを数える
export function useSessionSetCount(sessionId: number): number {
  const { data } = useLiveQuery(
    db
      .select({ count: sql<number>`sum(case when ${sets.completedAt} is not null then 1 else 0 end)` })
      .from(sets)
      .where(eq(sets.sessionId, sessionId)),
  );
  return data?.[0]?.count ?? 0;
}

export type ResumeWorkoutSummary = {
  completedExerciseCount: number;
  totalExerciseCount: number;
  completedSetCount: number;
  // ルーティンから開始したセッションのみルーティン名。手動開始（routineIdがnull）はnull
  // （呼び出し側のResumeWorkoutBannerが「トレーニング中」にフォールバックする）
  routineName: string | null;
};

// 記録タブ・カレンダー今日パネルの再開バナー(ResumeWorkoutBanner)用。進行中セッション1件分の
// 「種目数（完了/合計）」「完了セット数」「ルーティン名」をまとめて取得する。種目の完了判定は
// useAutoCollapseCompletedExercisesと同じ基準（セットが1件以上あり、全セットが✓確定済み）に揃える。
//
// sessionId/routineIdは呼び出し側のactiveSession（useWorkoutSessions自身のuseLiveQueryが非同期に
// 解決する）に由来するため、この関数が最初にマウントされた時点ではまだ-1のプレースホルダーで、
// 後続のレンダーで初めて実際の値になる。drizzle-orm/expo-sqliteのuseLiveQueryは第2引数dependsに
// 渡した配列が変化したときだけ内部useEffectを再実行してクエリを張り直す仕様（デフォルトは[]＝
// マウント時の1回きり）のため、sessionId/routineIdをdependsに渡さないと-1で張ったクエリの
// ままテーブル書き込みイベント頼みで固定されてしまい、実際のsessionId/routineIdが確定した後も
// 空データのまま更新されない（実機で再現・特定した不具合）。
//
// また、useLiveQueryの書き込み監視は「クエリのfrom()に渡した最初のテーブル」だけを見ており、
// leftJoinで結合した側のテーブルへの書き込みは検知しない（expo-sqliteのaddDatabaseChangeListener
// コールバックがconfig.name===tableNameで一致判定しているため）。そのためworkoutSessionExercises
// にsetsをleftJoinする実装だと、セット✓確定（setsテーブルへの書き込み）では再フェッチされず、
// セット数・完了状態が画面に戻ってもすぐ反映されない（実機で再現・特定）。setsの集計は
// useSessionSets等と同じくsetsテーブル単体のクエリに分け、種目カードとの突き合わせはJS側で行う
export function useResumeWorkoutSummary(session: WorkoutSession | null): ResumeWorkoutSummary {
  const sessionId = session?.id ?? -1;
  const routineId = session?.routineId ?? -1;

  const { data: exerciseIdRows } = useLiveQuery(
    db
      .select({ sessionExerciseId: workoutSessionExercises.id })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.sessionId, sessionId)),
    [sessionId],
  );

  const { data: setAggRows } = useLiveQuery(
    db
      .select({
        sessionExerciseId: sets.workoutSessionExerciseId,
        totalSets: sql<number>`count(${sets.id})`,
        completedSets: sql<number>`sum(case when ${sets.completedAt} is not null then 1 else 0 end)`,
      })
      .from(sets)
      .where(eq(sets.sessionId, sessionId))
      .groupBy(sets.workoutSessionExerciseId),
    [sessionId],
  );

  const { data: routineRows } = useLiveQuery(
    db.select({ name: routines.name }).from(routines).where(eq(routines.id, routineId)).limit(1),
    [routineId],
  );

  return useMemo(() => {
    const exerciseRows = exerciseIdRows ?? [];
    const setsByCard = new Map((setAggRows ?? []).map((r) => [r.sessionExerciseId, r]));
    let completedExerciseCount = 0;
    let completedSetCount = 0;
    for (const ex of exerciseRows) {
      const agg = setsByCard.get(ex.sessionExerciseId);
      const totalSets = agg?.totalSets ?? 0;
      const completedSets = agg?.completedSets ?? 0;
      if (totalSets > 0 && completedSets === totalSets) completedExerciseCount++;
      completedSetCount += completedSets;
    }
    return {
      completedExerciseCount,
      totalExerciseCount: exerciseRows.length,
      completedSetCount,
      routineName: session?.routineId != null ? (routineRows?.[0]?.name ?? null) : null,
    };
  }, [exerciseIdRows, setAggRows, routineRows, session?.routineId]);
}

// sessionExerciseIdはworkoutSessionExercises行自体のid。同じ種目をセッション内に複数回
// 追加できるため、exercise.id（種目そのもの）とは別にカード単位の識別子として持つ
export type SessionExercise = Exercise & { orderIndex: number; sessionExerciseId: number };

// トレーニング中画面に表示する、このセッションに追加済みの種目一覧（並び順つき）
export function useSessionExercises(sessionId: number): SessionExercise[] {
  const { data } = useLiveQuery(
    db
      .select({
        ...getTableColumns(exercises),
        orderIndex: workoutSessionExercises.orderIndex,
        sessionExerciseId: workoutSessionExercises.id,
      })
      .from(workoutSessionExercises)
      .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
      .where(eq(workoutSessionExercises.sessionId, sessionId))
      .orderBy(workoutSessionExercises.orderIndex),
  );
  return data ?? [];
}

// 種目カードの「⋮」メニューの「過去の記録から読み込む」を、そもそも読み込める過去記録が
// 無い種目では「上へ移動」等と同じくグレーアウトするための判定用。excludeSessionIdの種目の
// 過去カードを個別に問い合わせるとカードの数だけクエリが増えるため、このセッションに
// 関係なく「1件でも読み込み対象の過去記録がある種目id」をまとめて1クエリで取得する
export function useExercisesWithHistory(excludeSessionId: number): globalThis.Set<number> {
  const { data } = useLiveQuery(
    db
      .selectDistinct({ exerciseId: workoutSessionExercises.exerciseId })
      .from(sets)
      .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
      .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
      .where(
        and(
          ne(workoutSessionExercises.sessionId, excludeSessionId),
          isNotNull(workoutSessions.endedAt),
          isNotNull(sets.completedAt),
        ),
      ),
  );
  return useMemo(() => new Set((data ?? []).map((row) => row.exerciseId)), [data]);
}

// sessionSets.get(id)がヒットしない種目向けの安定した空配列参照。
// 呼び出し側で `?? []` すると毎レンダー新しい配列になりSessionExerciseCardのmemoが効かなくなるため、
// これを使ってもらう
export const EMPTY_SETS: Set[] = [];

// プリフィル対象外の種目向けの安定した空配列参照。EMPTY_SETSと同じ理由（`?? []`だと
// 毎レンダー新しい配列参照になりmemoが効かなくなる）でこれを使ってもらう
export const EMPTY_PREFILLED_SET_IDS: number[] = [];

// セット入力画面用。セッション内の全setsを一度だけ購読し、sessionExerciseId（カード単位）ごとに
// JS側でグルーピングする（種目カードの数だけlive queryを張ると数が増えるほど無駄が増えるため、
// useSessionStatsと同じ方針）。同じ種目をセッション内に複数回追加できるため、グルーピングキーは
// exerciseIdではなくworkoutSessionExerciseId（カードのid）にする必要がある。
// トレーニング中画面は経過時間タイマーで毎秒再レンダーされるため、liveQueryのdataが変わらない限り
// 同じMap参照を返すようuseMemoでグルーピング結果をキャッシュする
export function useSessionSets(sessionId: number): Map<number, Set[]> {
  const { data } = useLiveQuery(
    db.select().from(sets).where(eq(sets.sessionId, sessionId)).orderBy(sets.setNumber),
  );
  return useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const row of data ?? []) {
      const list = map.get(row.workoutSessionExerciseId);
      if (list) {
        list.push(row);
      } else {
        map.set(row.workoutSessionExerciseId, [row]);
      }
    }
    return map;
  }, [data]);
}
