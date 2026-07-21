import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export type ScheduledWorkoutTime = { scheduledDate: string; hour: number; minute: number };

// 直接予定の種目編集画面(app/calendar/schedule-workout-edit.tsx)のヘッダーに、対象の予定が
// いつのものか（日付・時刻）を表示するための最小限の取得。選択日パネルでは見えていた
// この情報が編集画面に遷移した瞬間消えてしまい、同日に複数の直接予定がある場合に
// どちらを編集しているか見失う、という@designer指摘への対応。
// hooks/use-workout-session.tsのuseWorkoutSessionと同じくloadedを分けて返す。data===undefined
// （まだ読み込み中）とdata=[]（読み込み済みだが対象行が無い＝削除済み）を区別できないと、
// この画面自身から予定を削除した直後にtime===nullを「見つからない」と誤検知して
// NotFoundStateへ切り替えるガードが書けない（@designer指摘: 削除→router.back()の間に
// 空状態がフラッシュする問題への対応）
export function useScheduledWorkoutTime(scheduledWorkoutId: number): { time: ScheduledWorkoutTime | null; loaded: boolean } {
  const { data } = useLiveQuery(
    db
      .select({ scheduledDate: scheduledWorkouts.scheduledDate, hour: scheduledWorkouts.hour, minute: scheduledWorkouts.minute })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
      .limit(1),
    [scheduledWorkoutId],
  );
  return { time: data?.[0] ?? null, loaded: data !== undefined };
}
