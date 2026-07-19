// scheduled-workouts-integration.test.tsと同様にbetter-sqlite3で実SQLiteを立て、
// reminder_schedule_skipsテーブルのFK制約(cascade)・unique制約がマイグレーションSQL通りに
// 効くことを検証する。DB操作関数の呼び出し順はモック化した単体テストが担う
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
    const sqlText = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
    db.exec(sqlText.replace(/--> statement-breakpoint/g, ''));
  }
}

function seedReminder(db: Database.Database): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO reminders (title, body, kind, hour, minute, created_at, updated_at)
     VALUES ('胸の日', '後でじゃなく、今やる。', 'weekly', 7, 0, ?, ?)`,
  ).run(now, now);
  return (db.prepare('SELECT id FROM reminders ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function seedSkip(db: Database.Database, reminderId: number, skippedDate: string): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO reminder_schedule_skips (reminder_id, skipped_date, created_at) VALUES (?, ?, ?)`,
  ).run(reminderId, skippedDate, now);
}

describe('reminder_schedule_skipsスキーマ - 実SQLite上でのFK/unique挙動', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('PRAGMA foreign_keys = ON: リマインダー削除はreminder_schedule_skipsにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const reminderId = seedReminder(db);
    seedSkip(db, reminderId, '2026-07-27');

    db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);

    const count = (
      db.prepare('SELECT COUNT(*) AS c FROM reminder_schedule_skips WHERE reminder_id = ?').get(reminderId) as {
        c: number;
      }
    ).c;
    expect(count).toBe(0);
  });

  it('別のリマインダーを削除しても、無関係なスキップ記録は消えない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const reminderA = seedReminder(db);
    const reminderB = seedReminder(db);
    seedSkip(db, reminderA, '2026-07-27');
    seedSkip(db, reminderB, '2026-08-03');

    db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderB);

    const remaining = db.prepare('SELECT reminder_id AS reminderId FROM reminder_schedule_skips').all() as {
      reminderId: number;
    }[];
    expect(remaining).toEqual([{ reminderId: reminderA }]);
  });

  it('同じreminderId+skippedDateの組は一意制約違反で例外を投げる(同じ日を二重にスキップできない)', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const reminderId = seedReminder(db);
    seedSkip(db, reminderId, '2026-07-27');

    expect(() => seedSkip(db, reminderId, '2026-07-27')).toThrow(/UNIQUE constraint failed/);
  });

  it('同じreminderIdでも日付が違えば複数のスキップ記録を持てる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const reminderId = seedReminder(db);
    seedSkip(db, reminderId, '2026-07-27');
    seedSkip(db, reminderId, '2026-08-03');

    const count = (
      db.prepare('SELECT COUNT(*) AS c FROM reminder_schedule_skips WHERE reminder_id = ?').get(reminderId) as {
        c: number;
      }
    ).c;
    expect(count).toBe(2);
  });

  it('存在しないreminder_idへのINSERTはFK制約違反で例外を投げる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    expect(() => seedSkip(db, 999999, '2026-07-27')).toThrow(/FOREIGN KEY constraint failed/);
  });

  // pruneExpiredReminderScheduleSkips(lib/calendar/reminder-skips.ts)は
  // `DELETE FROM reminder_schedule_skips WHERE skipped_date < ?` に相当するクエリを発行する。
  // 単体テストはdb.deleteをモック化しているため呼び出しの有無しか検証できず、
  // 'YYYY-MM-DD'形式の文字列比較としての境界(今日は消えない/昨日は消える)が
  // 実際のSQLite上で意図通りかは未検証だった(@reviewer Minor指摘#7)。ここでは
  // pruneExpiredReminderScheduleSkipsと同じWHERE句を実SQLiteに対して直接発行し、
  // 境界を検証する
  it('prune相当のクエリ(skipped_date < today)は、今日の記録は消さず過去日のみ削除する(境界値の実SQLite検証)', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const reminderId = seedReminder(db);

    const yesterday = '2026-07-26';
    const today = '2026-07-27';
    const tomorrow = '2026-07-28';
    seedSkip(db, reminderId, yesterday);
    seedSkip(db, reminderId, today);
    seedSkip(db, reminderId, tomorrow);

    db.prepare('DELETE FROM reminder_schedule_skips WHERE skipped_date < ?').run(today);

    const remaining = (
      db.prepare('SELECT skipped_date AS skippedDate FROM reminder_schedule_skips ORDER BY skipped_date').all() as {
        skippedDate: string;
      }[]
    ).map((r) => r.skippedDate);
    expect(remaining).toEqual([today, tomorrow]);
  });
});
