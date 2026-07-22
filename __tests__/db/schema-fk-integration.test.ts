// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、同じマイグレーションSQLを
// better-sqlite3（テスト専用、アプリ本体には未使用）で実行し、実SQLite上でのFK制約の
// 挙動そのものを検証する。db/client.tsのPRAGMA行が無いとrestrict/cascadeが効かないことも
// 対照実験として確認し、この設定の重要性を回帰テストで守る。
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

function applyMigration(db: Database.Database, file: string) {
  const sql = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
  db.exec(sql.replace(/--> statement-breakpoint/g, ''));
}

function applyAllMigrations(db: Database.Database) {
  for (const file of migrationFiles()) {
    applyMigration(db, file);
  }
}

function seedMinimalRows(db: Database.Database) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES ('自作種目', 'core', 'custom', 'reps', ?, ?)`,
  ).run(now, now);
  const exerciseId = (db.prepare('SELECT id FROM exercises').get() as { id: number }).id;

  db.prepare(
    `INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`,
  ).run(now, now, now);
  const sessionId = (db.prepare('SELECT id FROM workout_sessions').get() as { id: number }).id;

  db.prepare(
    `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
     VALUES (?, ?, 0, ?)`,
  ).run(sessionId, exerciseId, now);
  const workoutSessionExerciseId = (
    db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
  ).id;

  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, created_at)
     VALUES (?, ?, ?, 1, 20, 10, ?)`,
  ).run(sessionId, exerciseId, workoutSessionExerciseId, now);

  return { exerciseId, sessionId, workoutSessionExerciseId };
}

describe('recording feature M1 スキーマ - 実SQLite上でのFK挙動', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('PRAGMA foreign_keys = ON: 記録(sets)がある種目はrestrictで削除できない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON'); // db/client.tsと同じ設定
    applyAllMigrations(db);
    const { exerciseId } = seedMinimalRows(db);

    expect(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(exerciseId)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('PRAGMA foreign_keys = ON: セッション削除はsets/workout_session_exercisesにcascadeする', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { sessionId } = seedMinimalRows(db);

    db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(sessionId);

    const setsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM sets WHERE session_id = ?').get(sessionId) as {
        c: number;
      }
    ).c;
    const wseCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM workout_session_exercises WHERE session_id = ?')
        .get(sessionId) as { c: number }
    ).c;
    expect(setsCount).toBe(0);
    expect(wseCount).toBe(0);
  });

  it('対照実験: PRAGMAが無効だとrestrictは効かず、記録がある種目でも削除できてしまう', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF'); // db/client.tsのPRAGMA行が無い場合を再現
    applyAllMigrations(db);
    const { exerciseId } = seedMinimalRows(db);

    expect(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(exerciseId)).not.toThrow();
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM exercises WHERE id = ?').get(exerciseId) as {
      c: number;
    };
    expect(remaining.c).toBe(0);
  });

  // 2026-07-21「開始→終了しても予定が消えない」バグ修正の中核。scheduled_workouts削除時に
  // workout_sessions側までcascade削除されてしまうと、予定を消しただけでユーザーの実施記録
  // ごと消える重大なデータ損失バグになるため、set nullで済んでいることを実SQLiteで確認する
  // （モック化されたlib/workout/session.test.tsではマイグレーションSQLのタイポ自体は検出できない）
  it('scheduled_workouts削除はworkout_sessions.scheduled_workout_idをNULLにするだけで、セッション行(記録)自体は消えない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const now = Date.now();

    db.prepare(`INSERT INTO routines (name, order_index, created_at, updated_at) VALUES ('胸の日', 0, ?, ?)`).run(now, now);
    const routineId = (db.prepare('SELECT id FROM routines').get() as { id: number }).id;

    db.prepare(
      `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, created_at, updated_at)
       VALUES (?, '2026-07-21', 20, 0, ?, ?)`,
    ).run(routineId, now, now);
    const scheduledWorkoutId = (db.prepare('SELECT id FROM scheduled_workouts').get() as { id: number }).id;

    db.prepare(
      `INSERT INTO workout_sessions (started_at, ended_at, scheduled_workout_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(now, now, scheduledWorkoutId, now, now);
    const sessionId = (db.prepare('SELECT id FROM workout_sessions').get() as { id: number }).id;

    db.prepare('DELETE FROM scheduled_workouts WHERE id = ?').run(scheduledWorkoutId);

    const row = db.prepare('SELECT scheduled_workout_id FROM workout_sessions WHERE id = ?').get(sessionId) as {
      scheduled_workout_id: number | null;
    };
    expect(row.scheduled_workout_id).toBeNull();
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM workout_sessions WHERE id = ?').get(sessionId) as {
      c: number;
    };
    expect(remaining.c).toBe(1);
  });

  it('measurementTypeのバックフィル: 0010適用前からある既存データ(アップグレード想定)を種目ごとに正しく分類する', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // 0009までを適用した「アップグレード前の既存インストール」を再現し、
    // measurement_typeカラムが無い状態で手元のexercisesデータを先に入れておく。
    // 0010より後のマイグレーション（sets等に依存するもの）はこの時点でまだ適用してはいけない
    const files = migrationFiles();
    const migration0010 = files.find((f) => f.startsWith('0010_'))!;
    const upToPrevious = files.filter((f) => f < migration0010);
    for (const file of upToPrevious) applyMigration(db, file);

    const now = Date.now();
    const preexisting: [string, string][] = [
      ['bench_press', 'chest'],
      ['push_up', 'chest'],
      ['plank', 'core'],
      ['running', 'cardio'],
      ['farmers_walk', 'arm'],
    ];
    const insert = db.prepare(
      `INSERT INTO exercises (name, slug, category, source, created_at, updated_at)
       VALUES (?, ?, ?, 'preset', ?, ?)`,
    );
    for (const [slug, category] of preexisting) insert.run(slug, slug, category, now, now);

    // ここで0010を適用し、バックフィルUPDATEが正しく効くか確認する
    applyMigration(db, migration0010);

    const rows = db
      .prepare('SELECT slug, measurement_type FROM exercises WHERE slug IN (?, ?, ?, ?, ?)')
      .all(...preexisting.map(([slug]) => slug)) as { slug: string; measurement_type: string }[];
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.measurement_type]));

    expect(bySlug.bench_press).toBe('weight_reps'); // カラム追加時のデフォルト
    expect(bySlug.push_up).toBe('reps');
    expect(bySlug.plank).toBe('time');
    expect(bySlug.running).toBe('distance_time');
    expect(bySlug.farmers_walk).toBe('weight_time');
  });

  it('workout_session_exercise_idのバックフィル: 0012適用前(重複種目非対応)の既存setsを(session_id, exercise_id)一致で正しく紐付ける', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // 0011までを適用した「重複種目対応前」の既存インストールを再現する。
    // この時点のsetsはworkout_session_exercise_idカラムを持たない
    const files = migrationFiles();
    const migration0012 = files.find((f) => f.startsWith('0012_'))!;
    const upToPrevious = files.filter((f) => f < migration0012);
    for (const file of upToPrevious) applyMigration(db, file);

    const now = Date.now();
    const insertExercise = db.prepare(
      `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
       VALUES (?, 'core', 'custom', 'weight_reps', ?, ?)`,
    );
    insertExercise.run('種目A', now, now);
    insertExercise.run('種目B', now, now);
    const exercises = db.prepare('SELECT id, name FROM exercises ORDER BY id').all() as {
      id: number;
      name: string;
    }[];
    const exerciseAId = exercises[0].id;
    const exerciseBId = exercises[1].id;

    const insertSession = db.prepare(
      `INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`,
    );
    insertSession.run(now, now, now);
    insertSession.run(now, now, now);
    const sessions = db.prepare('SELECT id FROM workout_sessions ORDER BY id').all() as {
      id: number;
    }[];
    const session1Id = sessions[0].id;
    const session2Id = sessions[1].id;

    // session1には種目A・種目Bの2枚のカード、session2には種目Aのカードのみを作る。
    // 「同じexercise_idでもセッションが違えば別カード」「同じセッション内でも種目が違えば別カード」の
    // 両方を混在させ、(session_id, exercise_id)のAND条件が正しく効くことを検証する
    const insertWse = db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    insertWse.run(session1Id, exerciseAId, 0, now);
    insertWse.run(session1Id, exerciseBId, 1, now);
    insertWse.run(session2Id, exerciseAId, 0, now);
    const wseRows = db
      .prepare(
        'SELECT id, session_id, exercise_id FROM workout_session_exercises ORDER BY id',
      )
      .all() as { id: number; session_id: number; exercise_id: number }[];
    const wseSession1ExerciseA = wseRows[0].id;
    const wseSession1ExerciseB = wseRows[1].id;
    const wseSession2ExerciseA = wseRows[2].id;

    // 0011時点のsetsにはworkout_session_exercise_idカラムが無いので、旧カラム構成のまま挿入する
    const insertLegacySet = db.prepare(
      `INSERT INTO sets (session_id, exercise_id, set_number, weight, reps, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertLegacySet.run(session1Id, exerciseAId, 1, 20, 10, now); // → wseSession1ExerciseA
    insertLegacySet.run(session1Id, exerciseAId, 2, 22.5, 8, now); // → wseSession1ExerciseA
    insertLegacySet.run(session1Id, exerciseBId, 1, 0, 12, now); // → wseSession1ExerciseB (exercise_idで区別できるか)
    insertLegacySet.run(session2Id, exerciseAId, 1, 30, 5, now); // → wseSession2ExerciseA (session_idで区別できるか)

    // ここで0012を適用し、バックフィルが正しく効くか確認する
    applyMigration(db, migration0012);

    const rows = db
      .prepare(
        `SELECT session_id, exercise_id, set_number, workout_session_exercise_id
         FROM sets ORDER BY session_id, exercise_id, set_number`,
      )
      .all() as {
      session_id: number;
      exercise_id: number;
      set_number: number;
      workout_session_exercise_id: number;
    }[];

    expect(rows).toHaveLength(4);
    const session1ExerciseASets = rows.filter(
      (r) => r.session_id === session1Id && r.exercise_id === exerciseAId,
    );
    const session1ExerciseBSets = rows.filter(
      (r) => r.session_id === session1Id && r.exercise_id === exerciseBId,
    );
    const session2ExerciseASets = rows.filter(
      (r) => r.session_id === session2Id && r.exercise_id === exerciseAId,
    );

    expect(session1ExerciseASets).toHaveLength(2);
    expect(session1ExerciseASets.every((r) => r.workout_session_exercise_id === wseSession1ExerciseA)).toBe(true);
    expect(session1ExerciseBSets).toHaveLength(1);
    expect(session1ExerciseBSets[0].workout_session_exercise_id).toBe(wseSession1ExerciseB);
    expect(session2ExerciseASets).toHaveLength(1);
    expect(session2ExerciseASets[0].workout_session_exercise_id).toBe(wseSession2ExerciseA);
  });

  it('nth_weekday(単一値)→nth_weekdays(JSON配列)のリネーム+変換: 0013適用前の既存データを正しく配列化する', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // 0012までを適用した「第N曜日が単一値だった」既存インストールを再現する
    const files = migrationFiles();
    const migration0013 = files.find((f) => f.startsWith('0013_'))!;
    const upToPrevious = files.filter((f) => f < migration0013);
    for (const file of upToPrevious) applyMigration(db, file);

    const now = Date.now();
    db.prepare(
      `INSERT INTO reminders (title, body, kind, hour, minute, nth_week, nth_weekday, enabled, created_at, updated_at)
       VALUES ('第2月曜', '本文', 'monthly', 7, 0, 2, 1, 1, ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO reminders (title, body, kind, hour, minute, enabled, created_at, updated_at)
       VALUES ('曜日未設定の毎日', '本文', 'interval', 7, 0, 1, ?, ?)`,
    ).run(now, now);

    // ここで0013を適用し、リネーム+配列化バックフィルが正しく効くか確認する
    applyMigration(db, migration0013);

    const rows = db
      .prepare('SELECT title, nth_weekdays FROM reminders ORDER BY id')
      .all() as { title: string; nth_weekdays: string | null }[];

    expect(rows[0].nth_weekdays).toBe('[1]'); // 単一値1がJSON配列文字列に変換される
    expect(rows[1].nth_weekdays).toBeNull(); // NULLはNULLのまま
  });

  // 予定単位の通知トグル（2026-07-22）。単体テスト(lib/notifications/scheduled-workout-scheduler.test.ts)の
  // dbモックはwhere()に渡された引数の"形"しか検証できず、実SQLiteでnotify_enabled(integer 0/1)に対する
  // eq(col, true)相当のWHEREが本当にOFFの行を除外できるかは別に確認する必要がある
  // （@tester指摘: ここがsyncScheduledWorkoutNotificationsの唯一の防波堤のため）
  it('notify_enabledカラム: 0020適用前の既存データ(アップグレード想定)は、カラム追加時のDEFAULT trueで1にバックフィルされる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const files = migrationFiles();
    const migration0021 = files.find((f) => f.startsWith('0021_'))!;
    const upToPrevious = files.filter((f) => f < migration0021);
    for (const file of upToPrevious) applyMigration(db, file);

    const now = Date.now();
    // 0021適用前はnotify_enabledカラム自体が存在しないため、それを含まないINSERTで
    // 「アップグレード前からある既存の予定」を再現する
    db.prepare(
      `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, created_at, updated_at)
       VALUES (NULL, '2026-08-01', 19, 0, ?, ?)`,
    ).run(now, now);

    applyMigration(db, migration0021);

    const row = db.prepare('SELECT notify_enabled FROM scheduled_workouts').get() as {
      notify_enabled: number;
    };
    expect(row.notify_enabled).toBe(1);
  });

  it('notify_enabledによるWHERE絞り込み: OFF(0)の行を除外し、ON(1)の行だけを返す（syncScheduledWorkoutNotificationsの実クエリを模した回帰テスト）', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const now = Date.now();

    const insert = db.prepare(
      `INSERT INTO scheduled_workouts (routine_id, scheduled_date, hour, minute, notify_enabled, created_at, updated_at)
       VALUES (NULL, '2026-08-01', ?, 0, ?, ?, ?)`,
    );
    insert.run(19, 1, now, now); // ON
    insert.run(20, 0, now, now); // OFF

    const rows = db
      .prepare('SELECT hour FROM scheduled_workouts WHERE notify_enabled = 1')
      .all() as { hour: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].hour).toBe(19);
  });
});
