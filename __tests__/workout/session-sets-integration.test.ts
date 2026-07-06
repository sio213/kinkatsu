// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、schema-fk-integration.test.tsと同様に
// better-sqlite3で実SQLiteを立て、addExercisesToSession/addSetが行う操作を実SQLで再現して検証する。
// モック(session.test.ts)だけでは検証できない「実トランザクションのロールバック」「addSetのMAX+1採番との
// 整合性」を確認するのが目的。
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

function seedExerciseAndSession(db: Database.Database) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES ('自作種目', 'core', 'custom', 'weight_reps', ?, ?)`,
  ).run(now, now);
  const exerciseId = (db.prepare('SELECT id FROM exercises').get() as { id: number }).id;

  db.prepare(
    `INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`,
  ).run(now, now, now);
  const sessionId = (db.prepare('SELECT id FROM workout_sessions').get() as { id: number }).id;

  return { exerciseId, sessionId, now };
}

// lib/workout/sets.ts の addSet() が実際に発行するSQLをそのまま再現したもの。
// db/client.ts(expo-sqlite)依存でaddSet自体はjestから呼べないため、ロジックを直接ミラーして
// 実SQLite上での「直前セットの値コピー」「workoutSessionExerciseIdによるスコープ」を検証する。
// 注意: addSet()のoverrideValues引数（✓未タップの入力途中値を使うパス）はここではミラーしていない。
// addSet側のSQL/カラムを変更した場合はこのヘルパーも合わせて更新すること（自動追従はしない）
function addSetSql(
  db: Database.Database,
  sessionId: number,
  exerciseId: number,
  workoutSessionExerciseId: number,
) {
  const last = db
    .prepare(
      `SELECT set_number, weight, reps, duration_seconds, distance_meters
       FROM sets WHERE workout_session_exercise_id = ? ORDER BY set_number DESC LIMIT 1`,
    )
    .get(workoutSessionExerciseId) as
    | { set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null; distance_meters: number | null }
    | undefined;
  const nextNumber = (last?.set_number ?? 0) + 1;
  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, duration_seconds, distance_meters, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    nextNumber,
    last?.weight ?? null,
    last?.reps ?? null,
    last?.duration_seconds ?? null,
    last?.distance_meters ?? null,
    Date.now(),
  );
}

describe('種目追加時の自動セット生成 と addSet の整合性（実SQLite）', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('自動生成されたsetNumber=1の後にaddSet相当のMAX+1採番を行うとsetNumber=2になる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { exerciseId, sessionId, now } = seedExerciseAndSession(db);

    // addExercisesToSession相当: wse行を作り、直後に値が空のsetNumber=1を1件自動生成する
    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(sessionId, exerciseId, now);
    const wseId = (
      db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
    ).id;
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, completed_at, created_at)
       VALUES (?, ?, ?, 1, NULL, ?)`,
    ).run(sessionId, exerciseId, wseId, now);

    // addSet相当: そのカードの現在のMAX(set_number)+1で採番する
    const { maxSetNumber } = db
      .prepare(
        'SELECT MAX(set_number) AS maxSetNumber FROM sets WHERE workout_session_exercise_id = ?',
      )
      .get(wseId) as { maxSetNumber: number | null };
    const nextNumber = (maxSetNumber ?? 0) + 1;
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, completed_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    ).run(sessionId, exerciseId, wseId, nextNumber, now);

    const setNumbers = (
      db
        .prepare(
          'SELECT set_number FROM sets WHERE workout_session_exercise_id = ? ORDER BY set_number',
        )
        .all(wseId) as { set_number: number }[]
    ).map((r) => r.set_number);
    expect(setNumbers).toEqual([1, 2]);
  });

  it('自動セット生成が失敗した場合、同一トランザクション内のworkout_session_exercises insertもロールバックされる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { exerciseId, sessionId, now } = seedExerciseAndSession(db);

    const NONEXISTENT_EXERCISE_ID = 999999;

    // addExercisesToSession相当のトランザクション: wse行を作った直後、
    // sets insertがFK違反(存在しないexercise_id)で失敗するケースを再現する
    const runInTransaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
         VALUES (?, ?, 0, ?)`,
      ).run(sessionId, exerciseId, now);
      const wseId = (
        db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
      ).id;

      // exercise_idのFK(restrict)に違反させ、sets insertを失敗させる
      db.prepare(
        `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, completed_at, created_at)
         VALUES (?, ?, ?, 1, NULL, ?)`,
      ).run(sessionId, NONEXISTENT_EXERCISE_ID, wseId, now);
    });

    expect(() => runInTransaction()).toThrow();

    const wseCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM workout_session_exercises WHERE session_id = ?')
        .get(sessionId) as { c: number }
    ).c;
    expect(wseCount).toBe(0);
  });

  it('addSet相当のSQLは直前セット（setNumber最大）の重量・回数をそのままコピーする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { exerciseId, sessionId, now } = seedExerciseAndSession(db);

    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(sessionId, exerciseId, now);
    const wseId = (
      db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
    ).id;
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
       VALUES (?, ?, ?, 1, 62.5, 8, ?, ?)`,
    ).run(sessionId, exerciseId, wseId, now, now);

    addSetSql(db, sessionId, exerciseId, wseId);

    const rows = db
      .prepare(
        'SELECT set_number, weight, reps FROM sets WHERE workout_session_exercise_id = ? ORDER BY set_number',
      )
      .all(wseId) as { set_number: number; weight: number; reps: number }[];
    expect(rows).toEqual([
      { set_number: 1, weight: 62.5, reps: 8 },
      { set_number: 2, weight: 62.5, reps: 8 },
    ]);
  });

  it('同一セッション内で同じ種目を2枚カード化した場合、addSet相当のSQLは自カードの直前セットのみコピーする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { exerciseId, sessionId, now } = seedExerciseAndSession(db);

    // 同じexercise_idで2枚のカード(wse)を作る（ウォームアップ→本セットのような構成）
    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(sessionId, exerciseId, now);
    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 1, ?)`,
    ).run(sessionId, exerciseId, now);
    const wseRows = db
      .prepare('SELECT id FROM workout_session_exercises ORDER BY id')
      .all() as { id: number }[];
    const wseA = wseRows[0].id;
    const wseB = wseRows[1].id;

    // カードAには値ありのセットを入れておく
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
       VALUES (?, ?, ?, 1, 100, 5, ?, ?)`,
    ).run(sessionId, exerciseId, wseA, now, now);

    // カードBはまだセットが無い状態でaddSet相当を呼ぶ。カードAの値(100/5)を拾ってはいけない
    addSetSql(db, sessionId, exerciseId, wseB);

    const wseBSet = db
      .prepare('SELECT set_number, weight, reps FROM sets WHERE workout_session_exercise_id = ?')
      .get(wseB) as { set_number: number; weight: number | null; reps: number | null };
    expect(wseBSet).toEqual({ set_number: 1, weight: null, reps: null });
  });
});
