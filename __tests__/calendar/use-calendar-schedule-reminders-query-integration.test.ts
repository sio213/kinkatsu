// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、use-calendar-month-records-integration.test.ts
// と同様にbetter-sqlite3で実SQLiteを立て、hooks/use-calendar-month-schedule.ts・
// hooks/use-calendar-day-schedule.tsが共通して発行するremindersクエリを再現して検証する。
// 両フックとも「reminders起点、WHERE enabled=1 AND routine_id IS NOT NULL」という同一クエリを
// 使う（種目・ルーティン名の解決はhooks/use-routines.tsの既存フックに委譲しておりJOINは
// 発行しない）ため、この1ファイルでまとめて検証する。__tests__/calendar/use-calendar-month-schedule.test.ts・
// use-calendar-day-schedule.test.tsはdrizzle-orm/expo-sqlite自体を丸ごとモックしているため、
// WHERE句（routine_id IS NOT NULL・enabled=1）を実装から削除してもテストが検知できない
// 構造上の穴がある。ここでは実SQLを直接実行することでその穴を埋める。
// 注意: 両フック側のクエリを変更した場合はこのヘルパーも合わせて更新すること（自動追従はしない）
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.join(__dirname, '../../drizzle');

function migrationFiles() {
  return fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function applyAllMigrations(db: Database.Database) {
  for (const file of migrationFiles()) {
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
    db.exec(sql.replace(/--> statement-breakpoint/g, ''));
  }
}

function insertRoutine(db: Database.Database, name: string): number {
  const now = Date.now();
  db.prepare(`INSERT INTO routines (name, order_index, created_at, updated_at) VALUES (?, 0, ?, ?)`).run(name, now, now);
  return (db.prepare('SELECT id FROM routines ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function insertReminder(
  db: Database.Database,
  opts: { routineId: number | null; title: string; enabled: boolean },
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO reminders (routine_id, title, body, kind, hour, minute, interval_days, enabled, created_at, updated_at)
     VALUES (?, ?, 'body', 'interval', 7, 0, 1, ?, ?, ?)`,
  ).run(opts.routineId, opts.title, opts.enabled ? 1 : 0, now, now);
}

// hooks/use-calendar-month-schedule.ts・use-calendar-day-schedule.tsが共通で発行するSQLをミラーする
function getScheduleReminderRowsSql(db: Database.Database): { id: number; routineId: number; title: string }[] {
  return db
    .prepare(`SELECT id, routine_id AS routineId, title FROM reminders WHERE enabled = 1 AND routine_id IS NOT NULL`)
    .all() as { id: number; routineId: number; title: string }[];
}

describe('カレンダー予定表示フックが共通で使うremindersクエリ（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('単体リマインダー(routine_id IS NULL)は結果に含まれない', () => {
    insertReminder(db, { routineId: null, title: 'プロテインを飲む', enabled: true });
    expect(getScheduleReminderRowsSql(db)).toHaveLength(0);
  });

  it('無効化されたリマインダー(enabled=0)はルーティン紐付きでも結果に含まれない', () => {
    const routineId = insertRoutine(db, '胸の日');
    insertReminder(db, { routineId, title: '胸の日', enabled: false });
    expect(getScheduleReminderRowsSql(db)).toHaveLength(0);
  });

  it('有効かつルーティン紐付きのリマインダーは結果に含まれる', () => {
    const routineId = insertRoutine(db, '胸の日');
    insertReminder(db, { routineId, title: '胸の日', enabled: true });
    const rows = getScheduleReminderRowsSql(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].routineId).toBe(routineId);
  });

  it('複数ルーティンのリマインダーが混在していても、それぞれ正しいroutineIdで返る', () => {
    const chestRoutineId = insertRoutine(db, '胸の日');
    const legRoutineId = insertRoutine(db, '脚の日');
    insertReminder(db, { routineId: chestRoutineId, title: '胸の日', enabled: true });
    insertReminder(db, { routineId: legRoutineId, title: '脚の日', enabled: true });

    const rows = getScheduleReminderRowsSql(db);
    const byTitle = new Map(rows.map((r) => [r.title, r.routineId]));
    expect(byTitle.get('胸の日')).toBe(chestRoutineId);
    expect(byTitle.get('脚の日')).toBe(legRoutineId);
  });
});
