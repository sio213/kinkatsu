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

function seedScheduledWorkoutSet(db: Database.Database, scheduledWorkoutExerciseId: number, setNumber: number): void {
  db.prepare(
    `INSERT INTO scheduled_workout_sets (scheduled_workout_exercise_id, set_number, created_at) VALUES (?, ?, ?)`,
  ).run(scheduledWorkoutExerciseId, setNumber, Date.now());
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

  // replaceScheduledWorkoutExercise（lib/calendar/scheduled-workout-detail.ts、種目カード⋮
  // 「種目を入れ替え」用、2026-07-20）は「exerciseId更新→既存目標セット削除→新セットinsert」を
  // 1トランザクションで行う。ここではdb/client.tsのexpo-sqlite経由の実関数は呼べないため、
  // better-sqlite3のdb.transaction()で同じ操作順序を再現し、SQLiteのトランザクション自体が
  // 期待通りロールバックすることを検証する（@tester指摘: モックだけでは検知できない領域）
  describe('replaceScheduledWorkoutExercise相当の操作 - 実SQLite上でのトランザクション挙動', () => {
    it('新セットのinsertがFK違反で失敗した場合、先行するexerciseId更新・目標セット削除もロールバックされる', () => {
      db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      applyAllMigrations(db);
      const benchPress = seedExercise(db, 'ベンチプレス');
      const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
      seedScheduledWorkoutExercise(db, scheduledWorkoutId, benchPress, 0);
      const sweId = (db.prepare('SELECT id FROM scheduled_workout_exercises').get() as { id: number }).id;
      seedScheduledWorkoutSet(db, sweId, 1);

      const runReplace = db.transaction((newExerciseId: number) => {
        db.prepare('UPDATE scheduled_workout_exercises SET exercise_id = ? WHERE id = ?').run(newExerciseId, sweId);
        db.prepare('DELETE FROM scheduled_workout_sets WHERE scheduled_workout_exercise_id = ?').run(sweId);
        // 999999は存在しないscheduled_workout_exercise_id相当の異常値（安全網の再現）
        db.prepare(
          'INSERT INTO scheduled_workout_sets (scheduled_workout_exercise_id, set_number, created_at) VALUES (?, 1, ?)',
        ).run(999999, Date.now());
      });

      expect(() => runReplace(benchPress)).toThrow(/FOREIGN KEY constraint failed/);

      // ロールバックされ、exerciseIdも目標セットも元のまま残っている
      const exerciseRow = db.prepare('SELECT exercise_id AS exerciseId FROM scheduled_workout_exercises WHERE id = ?').get(sweId) as {
        exerciseId: number;
      };
      expect(exerciseRow.exerciseId).toBe(benchPress);
      const setCount = (db.prepare('SELECT COUNT(*) AS c FROM scheduled_workout_sets WHERE scheduled_workout_exercise_id = ?').get(sweId) as {
        c: number;
      }).c;
      expect(setCount).toBe(1);
    });
  });
});

// addScheduledWorkout（lib/calendar/scheduled-workouts.ts、2026-07-21よりルーティン予定も
// scheduledWorkoutExercises/scheduledWorkoutSetsを持つよう変更）は「scheduledWorkouts挿入→
// 種目挿入→目標セット挿入」を1トランザクションで行う。replaceScheduledWorkoutExercise相当の
// テストと同じ理由（モック化したdb.transactionではロールバック不整合を検知できない、
// @tester指摘）で、実SQLiteでのロールバック挙動を検証する
describe('addScheduledWorkout相当の操作 - 実SQLite上でのトランザクション挙動', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('種目コピー(scheduled_workout_exercises)のINSERTがFK違反で失敗した場合、先行するscheduled_workoutsのINSERTもロールバックされる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const routineId = seedRoutine(db, '胸の日');

    const runAddScheduledWorkout = db.transaction(() => {
      db.prepare(
        `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, created_at, updated_at)
         VALUES (?, '2026-07-25', 19, 0, ?, ?)`,
      ).run(routineId, Date.now(), Date.now());
      const scheduledWorkoutId = (
        db.prepare('SELECT id FROM scheduled_workouts ORDER BY id DESC LIMIT 1').get() as { id: number }
      ).id;
      // 999999は存在しないexercise_id（getRoutineDetailで種目一覧を読んだ直後に該当種目が
      // 削除された等の異常系再現）
      db.prepare(
        'INSERT INTO scheduled_workout_exercises (scheduled_workout_id, exercise_id, order_index, created_at) VALUES (?, 999999, 0, ?)',
      ).run(scheduledWorkoutId, Date.now());
    });

    expect(() => runAddScheduledWorkout()).toThrow(/FOREIGN KEY constraint failed/);

    const count = (db.prepare('SELECT COUNT(*) AS c FROM scheduled_workouts').get() as { c: number }).c;
    expect(count).toBe(0);
  });
});

describe('scheduled_workout_setsスキーマ - 実SQLite上でのFK挙動（2026-07-20の目標セット機能）', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('scheduled_workout_exercisesの削除はscheduled_workout_setsにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const exerciseId = seedExercise(db, 'ベンチプレス');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, exerciseId, 0);
    const sweId = (db.prepare('SELECT id FROM scheduled_workout_exercises').get() as { id: number }).id;
    seedScheduledWorkoutSet(db, sweId, 1);
    seedScheduledWorkoutSet(db, sweId, 2);

    db.prepare('DELETE FROM scheduled_workout_exercises WHERE id = ?').run(sweId);

    const count = (db.prepare('SELECT COUNT(*) AS c FROM scheduled_workout_sets').get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it('存在しないscheduled_workout_exercise_idへのINSERTはFK制約違反で例外を投げる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    expect(() => seedScheduledWorkoutSet(db, 999999, 1)).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('別の種目のセットを削除しても、無関係な種目のセットは消えない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const benchPress = seedExercise(db, 'ベンチプレス');
    const squat = seedExercise(db, 'スクワット');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, benchPress, 0);
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, squat, 1);
    const [sweA, sweB] = db.prepare('SELECT id FROM scheduled_workout_exercises ORDER BY id').all() as { id: number }[];
    seedScheduledWorkoutSet(db, sweA.id, 1);
    seedScheduledWorkoutSet(db, sweB.id, 1);

    db.prepare('DELETE FROM scheduled_workout_exercises WHERE id = ?').run(sweB.id);

    const remaining = db.prepare('SELECT scheduled_workout_exercise_id AS id FROM scheduled_workout_sets').all() as { id: number }[];
    expect(remaining).toEqual([{ id: sweA.id }]);
  });

  // removeScheduledWorkoutExercise（lib/calendar/scheduled-workout-detail.ts）の「予定には
  // 最低1種目必要」という制約はDB制約ではなくアプリ層のみで守られている（siblings.length<=1で
  // throw）。DBレベルでは1件だけになっても削除は拒否されないことを明示しておく
  // （@tester指摘：アプリ層のチェックが唯一の防波堤であることの回帰防止）
  it('最後の1種目でもDB制約自体はDELETEを拒否しない（アプリ層のremoveScheduledWorkoutExerciseが唯一の防波堤）', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const exerciseId = seedExercise(db, 'ベンチプレス');
    const scheduledWorkoutId = seedScheduledWorkout(db, null, '2026-07-25');
    seedScheduledWorkoutExercise(db, scheduledWorkoutId, exerciseId, 0);
    const sweId = (db.prepare('SELECT id FROM scheduled_workout_exercises').get() as { id: number }).id;

    expect(() => db.prepare('DELETE FROM scheduled_workout_exercises WHERE id = ?').run(sweId)).not.toThrow();
  });
});
