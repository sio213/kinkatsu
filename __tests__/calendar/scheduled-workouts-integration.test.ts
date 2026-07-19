// db-integration.test.tsと同様にbetter-sqlite3で実SQLiteを立て、scheduled_workoutsテーブルの
// FK制約(cascade)がマイグレーションSQL通りに効くことを検証する。lib/calendar/scheduled-workouts.ts
// の各関数の呼び出し順はモック化したscheduled-workouts.test.tsが担う
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

function seedRoutine(db: Database.Database, name: string): number {
  const now = Date.now();
  db.prepare(`INSERT INTO routines (name, order_index, created_at, updated_at) VALUES (?, 0, ?, ?)`).run(name, now, now);
  return (db.prepare('SELECT id FROM routines ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function seedScheduledWorkout(db: Database.Database, routineId: number, scheduledDate: string): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, created_at, updated_at)
     VALUES (?, ?, 19, 0, ?, ?)`,
  ).run(routineId, scheduledDate, now, now);
  return (db.prepare('SELECT id FROM scheduled_workouts ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

describe('scheduled_workoutsスキーマ - 実SQLite上でのFK挙動', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('PRAGMA foreign_keys = ON: ルーティン削除はscheduled_workoutsにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const routineId = seedRoutine(db, '胸の日');
    seedScheduledWorkout(db, routineId, '2026-07-25');

    db.prepare('DELETE FROM routines WHERE id = ?').run(routineId);

    const count = (
      db.prepare('SELECT COUNT(*) AS c FROM scheduled_workouts WHERE routine_id = ?').get(routineId) as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it('別のルーティンを削除しても、無関係な予定は消えない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const routineA = seedRoutine(db, '胸の日');
    const routineB = seedRoutine(db, '脚の日');
    seedScheduledWorkout(db, routineA, '2026-07-25');
    seedScheduledWorkout(db, routineB, '2026-07-26');

    db.prepare('DELETE FROM routines WHERE id = ?').run(routineB);

    const remaining = db.prepare('SELECT routine_id AS routineId FROM scheduled_workouts').all() as {
      routineId: number;
    }[];
    expect(remaining).toEqual([{ routineId: routineA }]);
  });

  it('idx_sw_dateインデックスにより日付範囲検索が成立する（クエリが例外を投げず期待件数を返す）', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const routineId = seedRoutine(db, '胸の日');
    seedScheduledWorkout(db, routineId, '2026-07-20');
    seedScheduledWorkout(db, routineId, '2026-07-25');
    seedScheduledWorkout(db, routineId, '2026-08-01');

    const rows = db
      .prepare(`SELECT scheduled_date AS d FROM scheduled_workouts WHERE scheduled_date >= ? AND scheduled_date < ?`)
      .all('2026-07-01', '2026-08-01') as { d: string }[];
    expect(rows.map((r) => r.d).sort()).toEqual(['2026-07-20', '2026-07-25']);
  });

  it('存在しないroutine_idへのINSERTはFK制約違反で例外を投げる（addScheduledWorkoutが呼ばれる直前にルーティンが削除された場合等の安全網）', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    expect(() => seedScheduledWorkout(db, 999999, '2026-07-25')).toThrow(/FOREIGN KEY constraint failed/);
  });
});
