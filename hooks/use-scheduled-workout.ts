import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

// routineId: ルーティン紐付き予定はnumber、直接予定（個別種目選択）はnull（2026-07-21、
// schedule-workout-edit.tsxの「ルーティンを編集」メニュー・削除確認文言の出し分け用に追加）
export type ScheduledWorkoutTime = { scheduledDate: string; hour: number; minute: number; routineId: number | null };

// 予定の種目編集画面(app/calendar/schedule-workout-edit.tsx、直接予定・実体化済みルーティン
// 予定どちらも)のヘッダーに、対象の予定がいつのものか（日付・時刻）を表示するための最小限の
// 取得。選択日パネルでは見えていたこの情報が編集画面に遷移した瞬間消えてしまい、同日に複数の
// 予定がある場合にどちらを編集しているか見失う、という@designer指摘への対応。
// hooks/use-workout-session.tsのuseWorkoutSessionと同じくloadedを分けて返す。data===undefined
// （まだ読み込み中）とdata=[]（読み込み済みだが対象行が無い＝削除済み）を区別できないと、
// この画面自身から予定を削除した直後にtime===nullを「見つからない」と誤検知して
// NotFoundStateへ切り替えるガードが書けない（@designer指摘: 削除→router.back()の間に
// 空状態がフラッシュする問題への対応）
export function useScheduledWorkoutTime(scheduledWorkoutId: number): { time: ScheduledWorkoutTime | null; loaded: boolean } {
  const { data } = useLiveQuery(
    db
      .select({
        scheduledDate: scheduledWorkouts.scheduledDate,
        hour: scheduledWorkouts.hour,
        minute: scheduledWorkouts.minute,
        routineId: scheduledWorkouts.routineId,
      })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
      .limit(1),
    [scheduledWorkoutId],
  );
  return { time: data?.[0] ?? null, loaded: data !== undefined };
}
