// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、schema-fk-integration.test.tsと同様に
// better-sqlite3で実SQLiteを立て、ルーティン関連テーブルのFK制約(cascade/restrict/set null)が
// マイグレーションSQL通りに効くことを検証する。lib/routines/db.tsの各関数はモック化したdb.test.tsで
// 呼び出し順を確認するに留め、実際のカスケード挙動の保証はこちらが担う。
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

function seedRoutineWithExerciseAndSets(db: Database.Database) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES ('自作種目', 'core', 'custom', 'weight_reps', ?, ?)`,
  ).run(now, now);
  const exerciseId = (db.prepare('SELECT id FROM exercises').get() as { id: number }).id;

  db.prepare(
    `INSERT INTO routines (name, order_index, created_at, updated_at) VALUES ('胸の日', 0, ?, ?)`,
  ).run(now, now);
  const routineId = (db.prepare('SELECT id FROM routines').get() as { id: number }).id;

  db.prepare(
    `INSERT INTO routine_exercises (routine_id, exercise_id, order_index, created_at)
     VALUES (?, ?, 0, ?)`,
  ).run(routineId, exerciseId, now);
  const routineExerciseId = (
    db.prepare('SELECT id FROM routine_exercises').get() as { id: number }
  ).id;

  db.prepare(
    `INSERT INTO routine_sets (routine_exercise_id, set_number, weight, reps, created_at)
     VALUES (?, 1, 60, 8, ?)`,
  ).run(routineExerciseId, now);

  return { exerciseId, routineId, routineExerciseId };
}

describe('ルーティン機能スキーマ - 実SQLite上でのFK挙動', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('PRAGMA foreign_keys = ON: ルーティン削除はroutine_exercises/routine_setsにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { routineId, routineExerciseId } = seedRoutineWithExerciseAndSets(db);

    db.prepare('DELETE FROM routines WHERE id = ?').run(routineId);

    const reCount = (
      db.prepare('SELECT COUNT(*) AS c FROM routine_exercises WHERE routine_id = ?').get(routineId) as {
        c: number;
      }
    ).c;
    const rsCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM routine_sets WHERE routine_exercise_id = ?')
        .get(routineExerciseId) as { c: number }
    ).c;
    expect(reCount).toBe(0);
    expect(rsCount).toBe(0);
  });

  it('PRAGMA foreign_keys = ON: routine_exercisesを直接消してもroutine_setsがcascadeで消える(updateRoutineの全置換で使う経路)', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { routineId, routineExerciseId } = seedRoutineWithExerciseAndSets(db);

    db.prepare('DELETE FROM routine_exercises WHERE routine_id = ?').run(routineId);

    const rsCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM routine_sets WHERE routine_exercise_id = ?')
        .get(routineExerciseId) as { c: number }
    ).c;
    expect(rsCount).toBe(0);
  });

  it('PRAGMA foreign_keys = ON: ルーティンで使用中の種目はrestrictで削除できない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { exerciseId } = seedRoutineWithExerciseAndSets(db);

    expect(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(exerciseId)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('対照実験: PRAGMAが無効だとrestrictは効かず、ルーティンで使用中の種目でも削除できてしまう', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    applyAllMigrations(db);
    const { exerciseId } = seedRoutineWithExerciseAndSets(db);

    expect(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(exerciseId)).not.toThrow();
  });

  it('reminders.routine_id: ルーティンに紐づくリマインダーは、ルーティン削除でNULLになる(deleteRoutine()のOS通知キャンセルが漏れた場合の安全網)', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { routineId } = seedRoutineWithExerciseAndSets(db);

    const now = Date.now();
    db.prepare(
      `INSERT INTO reminders (routine_id, title, body, kind, hour, minute, enabled, created_at, updated_at)
       VALUES (?, 'title', 'body', 'interval', 7, 0, 1, ?, ?)`,
    ).run(routineId, now, now);
    const reminderId = (db.prepare('SELECT id FROM reminders').get() as { id: number }).id;

    // deleteRoutine()を経由せず、生SQLでルーティン行だけ消した場合の挙動を確認する
    // （本来はdeleteReminder()経由でOS通知キャンセル込みで先に消すべきだが、
    // それが漏れても孤児参照にならないことを保証するのがこのON DELETE SET NULLの役目）
    db.prepare('DELETE FROM routines WHERE id = ?').run(routineId);

    const row = db.prepare('SELECT routine_id FROM reminders WHERE id = ?').get(reminderId) as {
      routine_id: number | null;
    };
    expect(row.routine_id).toBeNull();
  });

  it('reminders.routine_idが無い(単体リマインダー)場合はNULLのまま保存できる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);

    const now = Date.now();
    expect(() =>
      db
        .prepare(
          `INSERT INTO reminders (title, body, kind, hour, minute, enabled, created_at, updated_at)
           VALUES ('title', 'body', 'interval', 7, 0, 1, ?, ?)`,
        )
        .run(now, now),
    ).not.toThrow();
  });
});
