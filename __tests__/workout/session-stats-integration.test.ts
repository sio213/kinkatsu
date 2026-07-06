// hooks/use-workout-session.ts の useSessionStats() が発行するSQLをそのまま再現し、
// 実SQLite上で「✓未タップ（completedAtがnull）のセットはsetCount/totalVolumeに
// 含まれない」ことを検証する。saveDraft()導入により、未確定セットでもweight/repsが
// null以外になり得るようになったため、集計側の除外ロジックが実際に効いているかを
// モック(use-workout-session.test.ts)だけでなく実SQLでも担保する
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
    session_id AS sessionId,
    SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS setCount,
    COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN weight * reps ELSE 0 END), 0) AS totalVolume
  FROM sets
  GROUP BY session_id
`;

describe('useSessionStats相当の集計SQL（実SQLite）', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('✓未タップの下書き（completedAtがnull）のweight/repsはsetCount/totalVolumeに含まれない', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);

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

    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(sessionId, exerciseId, now);
    const wseId = (
      db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
    ).id;

    // 確定済み: 60kg x 10 = 600
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
       VALUES (?, ?, ?, 1, 60, 10, ?, ?)`,
    ).run(sessionId, exerciseId, wseId, now, now);

    // ✓未タップだがsaveDraftにより値だけ入っている状態（本来この分は集計対象外であるべき）
    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
       VALUES (?, ?, ?, 2, 80, 5, NULL, ?)`,
    ).run(sessionId, exerciseId, wseId, now);

    const row = db.prepare(STATS_SQL).get() as { sessionId: number; setCount: number; totalVolume: number };
    expect(row.setCount).toBe(1);
    expect(row.totalVolume).toBe(600);
  });

  it('全セットが✓未タップの場合、setCountは0・totalVolumeは0になる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);

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

    db.prepare(
      `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(sessionId, exerciseId, now);
    const wseId = (
      db.prepare('SELECT id FROM workout_session_exercises').get() as { id: number }
    ).id;

    db.prepare(
      `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
       VALUES (?, ?, ?, 1, 100, 3, NULL, ?)`,
    ).run(sessionId, exerciseId, wseId, now);

    const row = db.prepare(STATS_SQL).get() as { sessionId: number; setCount: number; totalVolume: number };
    expect(row.setCount).toBe(0);
    expect(row.totalVolume).toBe(0);
  });
});
