// hooks/use-workout-session.ts の useSessionStats() が発行するSQLをそのまま再現し、
// 実SQLite上で集計が意図どおりに効いているかを検証する。モック(use-workout-session.test.ts)は
// drizzleごと差し替えていてSQL自体を実行しないため、ここだけが本物のSQLを通す場所になる。
//
// 見ているのは2つ。「✓未タップ（completedAtがnull）のセットはsetCount/totalVolumeに含まれない」
// ——saveDraft()導入により未確定セットでもweight/repsがnull以外になり得るため——と、
// 「pairedWeightsの種目の総重量が左右2つ分になる」こと。
//
// **STATS_SQLは実装のコピーなので、useSessionStats()のクエリを変えたらここも必ず追随させること。**
// 古いSQLのまま緑になっていても、それは本物のSQLが通ったという意味にはならない
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.join(__dirname, '../../drizzle');

function applyAllMigrations(db: Database.Database) {
  const files = fs.readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
    db.exec(sql.replace(/--> statement-breakpoint/g, ''));
  }
}

// useSessionStats()のdrizzleクエリと同じ集計SQL
const STATS_SQL = `
  SELECT
    sets.session_id AS sessionId,
    SUM(CASE WHEN sets.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS setCount,
    COALESCE(SUM(CASE WHEN sets.completed_at IS NOT NULL
      THEN sets.weight * sets.reps * (CASE WHEN exercises.paired_weights THEN 2 ELSE 1 END)
      ELSE 0 END), 0) AS totalVolume
  FROM sets
  INNER JOIN exercises ON sets.exercise_id = exercises.id
  GROUP BY sets.session_id
`;

type StatsRow = { sessionId: number; setCount: number; totalVolume: number };

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyAllMigrations(db);
  return db;
}

const NOW = 1_700_000_000_000;

function insertExercise(db: Database.Database, name: string, pairedWeights = 0): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO exercises (name, category, source, measurement_type, paired_weights, created_at, updated_at)
       VALUES (?, 'core', 'custom', 'weight_reps', ?, ?, ?)`,
    )
    .run(name, pairedWeights, NOW, NOW);
  return Number(lastInsertRowid);
}

function insertSession(db: Database.Database): number {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`)
    .run(NOW, NOW, NOW);
  return Number(lastInsertRowid);
}

/** セッション内の種目カード1枚。同じ種目を複数回追加できるのでセットとは別に作る */
function insertCard(
  db: Database.Database,
  sessionId: number,
  exerciseId: number,
  orderIndex: number,
): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(sessionId, exerciseId, orderIndex, NOW);
  return Number(lastInsertRowid);
}

function insertSet(
  db: Database.Database,
  ids: { sessionId: number; exerciseId: number; cardId: number },
  set: { setNumber: number; weight: number | null; reps: number | null; completed: boolean },
) {
  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ids.sessionId,
    ids.exerciseId,
    ids.cardId,
    set.setNumber,
    set.weight,
    set.reps,
    set.completed ? NOW : null,
    NOW,
  );
}

describe('useSessionStats相当の集計SQL（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  afterEach(() => {
    db.close();
  });

  it('✓未タップの下書き（completedAtがnull）のweight/repsはsetCount/totalVolumeに含まれない', () => {
    const exerciseId = insertExercise(db, '自作種目');
    const sessionId = insertSession(db);
    const cardId = insertCard(db, sessionId, exerciseId, 0);
    const ids = { sessionId, exerciseId, cardId };

    // 確定済み: 60kg x 10 = 600
    insertSet(db, ids, { setNumber: 1, weight: 60, reps: 10, completed: true });
    // ✓未タップだがsaveDraftにより値だけ入っている状態（本来この分は集計対象外であるべき）
    insertSet(db, ids, { setNumber: 2, weight: 80, reps: 5, completed: false });

    const row = db.prepare(STATS_SQL).get() as StatsRow;
    expect(row.setCount).toBe(1);
    expect(row.totalVolume).toBe(600);
  });

  it('全セットが✓未タップの場合、setCountは0・totalVolumeは0になる', () => {
    const exerciseId = insertExercise(db, '自作種目');
    const sessionId = insertSession(db);
    const cardId = insertCard(db, sessionId, exerciseId, 0);

    insertSet(db, { sessionId, exerciseId, cardId }, {
      setNumber: 1,
      weight: 100,
      reps: 3,
      completed: false,
    });

    const row = db.prepare(STATS_SQL).get() as StatsRow;
    expect(row.setCount).toBe(0);
    expect(row.totalVolume).toBe(0);
  });

  it('paired_weightsの種目は総重量が左右2つ分になる', () => {
    const exerciseId = insertExercise(db, 'ダンベルベンチプレス', 1);
    const sessionId = insertSession(db);
    const cardId = insertCard(db, sessionId, exerciseId, 0);

    insertSet(db, { sessionId, exerciseId, cardId }, {
      setNumber: 1,
      weight: 10,
      reps: 10,
      completed: true,
    });

    const row = db.prepare(STATS_SQL).get() as StatsRow;
    expect(row.totalVolume).toBe(200);
    // 倍になるのは重量だけ。セット数まで水増しされていないことを確かめる
    expect(row.setCount).toBe(1);
  });

  it('paired_weightsの種目と通常の種目が同じセッションに混在しても、種目ごとの倍率で合算される', () => {
    const dumbbell = insertExercise(db, 'ダンベルベンチプレス', 1);
    const barbell = insertExercise(db, 'ベンチプレス');
    const sessionId = insertSession(db);
    const dumbbellCard = insertCard(db, sessionId, dumbbell, 0);
    const barbellCard = insertCard(db, sessionId, barbell, 1);

    // 10kg x 10 の左右2つ分 = 200
    insertSet(db, { sessionId, exerciseId: dumbbell, cardId: dumbbellCard }, {
      setNumber: 1,
      weight: 10,
      reps: 10,
      completed: true,
    });
    // 60kg x 10 = 600（倍にしない）
    insertSet(db, { sessionId, exerciseId: barbell, cardId: barbellCard }, {
      setNumber: 1,
      weight: 60,
      reps: 10,
      completed: true,
    });

    const row = db.prepare(STATS_SQL).get() as StatsRow;
    expect(row.totalVolume).toBe(800);
    expect(row.setCount).toBe(2);
  });

  it('exercisesへのjoinでセッションの行が落ちない（sets.exercise_idはnotNullのFK）', () => {
    const exerciseId = insertExercise(db, '自作種目');
    const sessionA = insertSession(db);
    const sessionB = insertSession(db);
    insertSet(db, { sessionId: sessionA, exerciseId, cardId: insertCard(db, sessionA, exerciseId, 0) }, {
      setNumber: 1,
      weight: 50,
      reps: 10,
      completed: true,
    });
    insertSet(db, { sessionId: sessionB, exerciseId, cardId: insertCard(db, sessionB, exerciseId, 0) }, {
      setNumber: 1,
      weight: 40,
      reps: 10,
      completed: true,
    });

    const rows = db.prepare(STATS_SQL).all() as StatsRow[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.totalVolume).sort((a, b) => a - b)).toEqual([400, 500]);
  });
});
