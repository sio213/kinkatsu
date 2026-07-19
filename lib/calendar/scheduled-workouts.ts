import { db } from '@/db/client';
import { scheduledWorkouts } from '@/db/schema';
import { eq } from 'drizzle-orm';

// カレンダーで手動追加する予定（リマインダーとは無関係、PR10確定仕様）。呼び出し側
// （画面）でtry/catch + Alert.alertするルール（CLAUDE.md実装ルール）のため、ここでは
// エラーハンドリングをせず素直にthrowする
export async function addScheduledWorkout(routineId: number, scheduledDate: string, hour: number, minute: number): Promise<number> {
  // 現状の唯一の呼び出し元(schedule-time-picker.tsx)はDateTimePicker経由で常に妥当な範囲の
  // 値しか渡さないが、DBスキーマ側にCHECK制約が無いため、将来別の呼び出し元が増えた際の
  // 安全網としてここで範囲チェックする（PRレビュー指摘対応）
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`invalid hour: ${hour}`);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`invalid minute: ${minute}`);

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
