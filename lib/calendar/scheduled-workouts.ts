import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { eq } from 'drizzle-orm';

// カレンダーで手動追加する予定（リマインダーとは無関係、PR10確定仕様）。呼び出し側
// （画面）でtry/catch + Alert.alertするルール（CLAUDE.md実装ルール）のため、ここでは
// エラーハンドリングをせず素直にthrowする
export async function addScheduledWorkout(routineId: number, scheduledDate: string, hour: number, minute: number): Promise<number> {
  const now = Date.now();
  const [inserted] = await db
    .insert(scheduledWorkouts)
    .values({ routineId, scheduledDate, hour, minute, createdAt: now, updatedAt: now })
    .returning();
  return inserted.id;
}

// 呼び出し元は本PR(PR10-1)時点では未配線（削除UIは後続PRで追加予定、2026-07-19確定）。
// DB層とテストだけ先に用意している
export async function deleteScheduledWorkout(id: number): Promise<void> {
  await db.delete(scheduledWorkouts).where(eq(scheduledWorkouts.id, id));
}
