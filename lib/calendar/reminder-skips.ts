import { db } from '@/db/client';
import { reminderScheduleSkips } from '@/db/schema';
import { toDateKey } from '@/lib/calendar/date-grid';
import { and, eq, lt } from 'drizzle-orm';

// リマインダー由来の予定を特定の1日だけ打ち消す記録（PR10-6）。呼び出し側（画面）で
// try/catch + Alert.alertするルール（CLAUDE.md実装ルール）のため、ここではエラー
// ハンドリングをせず素直にthrowする（lib/calendar/scheduled-workouts.tsと同じ方針）
export async function addReminderScheduleSkip(reminderId: number, skippedDate: string): Promise<number> {
  const [inserted] = await db
    .insert(reminderScheduleSkips)
    .values({ reminderId, skippedDate, createdAt: Date.now() })
    .returning();
  return inserted.id;
}

// 2026-07-19にユーザー向けの「元に戻す」UIは廃止され、現在は「今回だけ差し替え」フローの
// 内部ロールバック専用（lib/notifications/reminder-skip-scheduler.tsのunskipReminderOccurrence経由）
export async function removeReminderScheduleSkip(reminderId: number, skippedDate: string): Promise<void> {
  await db
    .delete(reminderScheduleSkips)
    .where(and(eq(reminderScheduleSkips.reminderId, reminderId), eq(reminderScheduleSkips.skippedDate, skippedDate)));
}

// lib/notifications/reminder-skip-scheduler.tsのskipReminderOccurrenceが、⋮メニュー連打等での
// 二重スキップ(reminderId+skippedDateのunique制約違反)を避けて冪等に振る舞うための存在チェック
export async function hasReminderScheduleSkip(reminderId: number, skippedDate: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(reminderScheduleSkips)
    .where(and(eq(reminderScheduleSkips.reminderId, reminderId), eq(reminderScheduleSkips.skippedDate, skippedDate)));
  return rows.length > 0;
}

// ネイティブ方式リマインダーの一時キュー化判定(PR10-6c)用。「このリマインダーに未来含め
// 何らかのスキップ記録が1件でも残っているか」だけを見る(日付は問わない。過去分は
// pruneExpiredReminderScheduleSkipsで先に消える前提のため、実質「今日以降のスキップの有無」)
export async function hasAnyReminderScheduleSkip(reminderId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(reminderScheduleSkips)
    .where(eq(reminderScheduleSkips.reminderId, reminderId));
  return rows.length > 0;
}

// refillAllReminders(全リマインダー一括補充)向け。1件ずつhasAnyReminderScheduleSkipを
// 呼ぶとリマインダー数だけN+1クエリになるため、全件のreminderIdをまとめてSetで返す
export async function getReminderIdsWithSkips(): Promise<Set<number>> {
  const rows = await db.select({ reminderId: reminderScheduleSkips.reminderId }).from(reminderScheduleSkips);
  return new Set(rows.map((r) => r.reminderId));
}

// アプリ起動時(app/_layout.tsxのonAppStart)に呼ぶ。過去日分のスキップ記録はcards/月グリッド
// どちらの判定にも二度と使われないため、pruneExpiredNotifications(lib/notifications/scheduler.ts、
// reminderNotifications向け)と同じ考え方でクエリ対象から掃除する(@reviewer指摘: 蓄積して
// 全件取得のコストが増え続けるのを防ぐ)
export async function pruneExpiredReminderScheduleSkips(now = new Date()): Promise<void> {
  await db.delete(reminderScheduleSkips).where(lt(reminderScheduleSkips.skippedDate, toDateKey(now)));
}
