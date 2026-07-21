import { db } from '@/db/client';
import { exercises, sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { aggregateDailyCategorySet, aggregateDailyPrimaryCategory, type DailyCategoryRow } from '@/lib/calendar/day-category';
import { toDateKey } from '@/lib/calendar/date-grid';
import { and, asc, eq, gte, isNotNull, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

// 同一セッション内に確定(✓)セットが1件でも有るかを判定する相関サブクエリ用のエイリアス。
// メインクエリのsetsとは別名で参照する必要がある
const confirmedSetsInSession = alias(sets, 'confirmed_sets_in_session');

export type CalendarMonthRecords = {
  // 日付キー(YYYY-MM-DD)→代表カテゴリ（月グリッドのセル塗りつぶし色に使う。実績がある日だけキーを持つ）
  primaryCategoryByDay: Map<string, string>;
  // 日付キー→その日に実施した全カテゴリの集合（カテゴリフィルターの「該当カテゴリを1件でも
  // 実施したか」判定に使う。代表カテゴリだけでは埋もれる少数セットのカテゴリも拾うため別に持つ）
  categorySetByDay: Map<string, Set<string>>;
};

// カレンダーの日別マーカー・カテゴリフィルター用。[startMs, endMs)の範囲に開始した実績
// （終了済みセッション）を日付ごとに集計する。集計対象は「確定(✓)セット」を基本としつつ、
// セッション内に確定セットが1件も無い（すべて未確定のまま終了した）場合だけ、そのセッションの
// 未確定セットで補完する（完了0件セッションもマーカー表示されるようにしつつ、確定セットが
// 一部でもある通常の日の代表カテゴリ・カテゴリ集合が未確定セットの混入で変わらないようにするため）。
// startMs/endMsは表示中の月グリッド
// （前月/当月/翌月をまたぐ場合はそれを含む範囲）をカバーする呼び出し側の責務とする。sets単位で
// JOINし、集計対象セット1件につき1行取得することで「セット数が最も多いカテゴリ」の集計に
// そのまま使える形にしている
export function useCalendarMonthRecords(startMs: number, endMs: number): CalendarMonthRecords {
  // useLiveQueryはクエリのfrom()に指定したテーブル（このクエリではsets）の変更しか自動購読しない
  // （drizzle-orm/expo-sqlite/query.jsの実装がquery.config.table1つだけを対象にaddDatabaseChangeListener
  // している）。トレーニング終了(endWorkoutSession)はworkoutSessions.endedAtを更新するだけでsetsには
  // 書き込みが無いため、このクエリ単体では終了直後に月グリッドの色分けが更新されないバグがあった。
  // workoutSessions側にも同じ範囲で軽量な購読を張り、その更新をdepsに含めることでメインクエリの
  // 再購読・即時再フェッチを強制する（deps変更でuseEffectが張り直され、内部で無条件にquery.then()
  // が走るため）。どちらのdepsにもstartMs/endMsを含める必要がある（省略するとdefaultの[]により
  // マウント時のクロージャに固定され、月送りでrangeが変わってもクエリが再購読されない）
  const { data: sessionsInRangeSignal } = useLiveQuery(
    db
      .select({ id: workoutSessions.id, endedAt: workoutSessions.endedAt })
      .from(workoutSessions)
      .where(and(gte(workoutSessions.startedAt, startMs), lt(workoutSessions.startedAt, endMs))),
    [startMs, endMs],
  );

  const { data } = useLiveQuery(
    db
      .select({
        startedAt: workoutSessions.startedAt,
        category: exercises.category,
      })
      .from(sets)
      .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
      .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
      .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
      .where(
        and(
          gte(workoutSessions.startedAt, startMs),
          lt(workoutSessions.startedAt, endMs),
          isNotNull(workoutSessions.endedAt),
          or(
            isNotNull(sets.completedAt),
            notExists(
              db
                .select({ one: sql`1` })
                .from(confirmedSetsInSession)
                .where(
                  and(
                    eq(confirmedSetsInSession.sessionId, sets.sessionId),
                    isNotNull(confirmedSetsInSession.completedAt),
                  ),
                ),
            ),
          ),
        ),
      )
      // 集計側(aggregateDailyPrimaryCategory)が「先頭に見つかった行=先にやった種目」という
      // 前提を置いているため、セッション開始時刻→カード追加順で必ず安定ソートする。
      // 同一ミリ秒に開始したセッションが複数あるケース（lib/workout/history.tsの
      // getPastTrainingSessionsと同じ懸念）に備え、セッションidも最終タイブレークに加えて
      // 常に決定的な順序にする（orderIndexはソートにのみ使うためselect projectionには含めない）
      .orderBy(asc(workoutSessions.startedAt), asc(workoutSessions.id), asc(workoutSessionExercises.orderIndex)),
    [startMs, endMs, sessionsInRangeSignal],
  );

  return useMemo(() => {
    const rows: DailyCategoryRow[] = (data ?? []).map((r) => ({
      dateKey: toDateKey(new Date(r.startedAt)),
      category: r.category,
    }));
    return {
      primaryCategoryByDay: aggregateDailyPrimaryCategory(rows),
      categorySetByDay: aggregateDailyCategorySet(rows),
    };
  }, [data]);
}
