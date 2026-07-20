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

function seedScheduledWorkout(db: Database.Database, routineId: number | null, scheduledDate: string): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, created_at, updated_at)
     VALUES (?, ?, 19, 0, ?, ?)`,
  ).run(routineId, scheduledDate, now, now);
  return (db.prepare('SELECT id FROM scheduled_workouts ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function seedExercise(db: Database.Database, name: string): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at) VALUES (?, 'chest', 'preset', 'weight_reps', ?, ?)`,
  ).run(name, now, now);
  return (db.prepare('SELECT id FROM exercises ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function seedScheduledWorkoutExercise(db: Database.Database, scheduledWorkoutId: number, exerciseId: number, orderIndex: number): void {
  db.prepare(
    `INSERT INTO scheduled_workout_exercises (scheduled_workout_id, exercise_id, order_index, created_at) VALUES (?, ?, ?, ?)`,
  ).run(scheduledWorkoutId, exerciseId, orderIndex, Date.now());
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

  it('routine_idはnullを許容する（「直接追加」予定、2026-07-20のNOT NULL解除マイグレーション）', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');

    const row = db.prepare('SELECT routine_id AS routineId FROM scheduled_workouts WHERE id = ?').get(scheduledWorkoutId) as {
      routineId: number | null;
    };
    expect(row.routineId).toBeNull();
  });
});

describe('scheduled_workout_exercisesスキーマ - 実SQLite上でのFK挙動（2026-07-20の「直接追加」予定）', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('予定(scheduled_workouts)の削除はscheduled_workout_exercisesにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const exerciseId = seedExercise(db, 'ベンチプレス');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, exerciseId, 0);

    db.prepare('DELETE FROM scheduled_workouts WHERE id = ?').run(scheduledWorkoutId);

    const count = (
      db
        .prepare('SELECT COUNT(*) AS c FROM scheduled_workout_exercises WHERE scheduled_workout_id = ?')
        .get(scheduledWorkoutId) as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it('種目(exercises)の削除はscheduled_workout_exercisesが参照している限りFK制約違反で拒否される(onDelete: restrict)', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const exerciseId = seedExercise(db, 'ベンチプレス');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, exerciseId, 0);

    expect(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(exerciseId)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('別の予定を削除しても、無関係な予定の種目は消えない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const benchPress = seedExercise(db, 'ベンチプレス');
    const squat = seedExercise(db, 'スクワット');
    const scheduleA = seedScheduledWorkout(db, null, '2026-07-25');
    const scheduleB = seedScheduledWorkout(db, null, '2026-07-26');
    seedScheduledWorkoutExercise(db, scheduleA, benchPress, 0);
    seedScheduledWorkoutExercise(db, scheduleB, squat, 0);

    db.prepare('DELETE FROM scheduled_workouts WHERE id = ?').run(scheduleB);

    const remaining = db
      .prepare('SELECT scheduled_workout_id AS scheduledWorkoutId FROM scheduled_workout_exercises')
      .all() as { scheduledWorkoutId: number }[];
    expect(remaining).toEqual([{ scheduledWorkoutId: scheduleA }]);
  });

  it('存在しないexercise_idへのINSERTはFK制約違反で例外を投げる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    expect(() => seedScheduledWorkoutExercise(db, scheduledWorkoutId, 999999, 0)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('idx_swe_scheduleインデックスにより、scheduled_workout_id指定のクエリが例外を投げず期待順(order_index)で返る', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const benchPress = seedExercise(db, 'ベンチプレス');
    const squat = seedExercise(db, 'スクワット');
    const deadlift = seedExercise(db, 'デッドリフト');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, squat, 1);
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, benchPress, 0);
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, deadlift, 2);

    const rows = db
      .prepare(
        'SELECT exercise_id AS exerciseId FROM scheduled_workout_exercises WHERE scheduled_workout_id = ? ORDER BY order_index',
      )
      .all(scheduledWorkoutId) as { exerciseId: number }[];
    expect(rows.map((r) => r.exerciseId)).toEqual([benchPress, squat, deadlift]);
  });

  // updateScheduledWorkoutExercises（lib/calendar/scheduled-workouts.ts、種目一覧をまとめて
  // 編集する画面用、2026-07-20）は「delete→insert→update」を1トランザクションで行う。
  // ここではdb/client.tsのexpo-sqlite経由の実関数は呼べないため、better-sqlite3の
  // db.transaction()で同じdelete→insertの順序を再現し、SQLiteのトランザクション自体が
  // 期待通りロールバックすることを検証する（@tester指摘: モックだけでは検知できない領域）
  describe('updateScheduledWorkoutExercises相当の操作 - 実SQLite上でのトランザクション挙動', () => {
    it('挿入フェーズがFK違反で失敗した場合、先行するdeleteだけがコミットされず全体がロールバックされる', () => {
      db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      applyAllMigrations(db);
      const benchPress = seedExercise(db, 'ベンチプレス');
      const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
      seedScheduledWorkoutExercise(db, scheduledWorkoutId, benchPress, 0);

      const runUpdate = db.transaction((newExerciseId: number) => {
        db.prepare('DELETE FROM scheduled_workout_exercises WHERE scheduled_workout_id = ?').run(scheduledWorkoutId);
        // 999999は存在しないexercise_id（レース条件で別経路から削除された想定の安全網）
        db.prepare(
          'INSERT INTO scheduled_workout_exercises (scheduled_workout_id, exercise_id, order_index, created_at) VALUES (?, ?, 0, ?)',
        ).run(scheduledWorkoutId, newExerciseId, Date.now());
      });

      expect(() => runUpdate(999999)).toThrow(/FOREIGN KEY constraint failed/);

      // ロールバックされ、deleteされたはずの元のベンチプレス行がそのまま残っている
      const remaining = db
        .prepare('SELECT exercise_id AS exerciseId FROM scheduled_workout_exercises WHERE scheduled_workout_id = ?')
        .all(scheduledWorkoutId) as { exerciseId: number }[];
      expect(remaining).toEqual([{ exerciseId: benchPress }]);
    });

    it('正常系: delete→insertが1トランザクションでコミットされ、新しい種目一覧に置き換わる', () => {
      db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      applyAllMigrations(db);
      const benchPress = seedExercise(db, 'ベンチプレス');
      const squat = seedExercise(db, 'スクワット');
      const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
      seedScheduledWorkoutExercise(db, scheduledWorkoutId, benchPress, 0);

      const runUpdate = db.transaction((newExerciseId: number) => {
        db.prepare('DELETE FROM scheduled_workout_exercises WHERE scheduled_workout_id = ?').run(scheduledWorkoutId);
        db.prepare(
          'INSERT INTO scheduled_workout_exercises (scheduled_workout_id, exercise_id, order_index, created_at) VALUES (?, ?, 0, ?)',
        ).run(scheduledWorkoutId, newExerciseId, Date.now());
      });
      runUpdate(squat);

      const rows = db
        .prepare('SELECT exercise_id AS exerciseId FROM scheduled_workout_exercises WHERE scheduled_workout_id = ?')
        .all(scheduledWorkoutId) as { exerciseId: number }[];
      expect(rows).toEqual([{ exerciseId: squat }]);
    });
  });
});
