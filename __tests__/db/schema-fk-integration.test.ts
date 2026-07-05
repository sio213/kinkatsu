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

  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, set_number, weight, reps, created_at)
     VALUES (?, ?, 1, 20, 10, ?)`,
  ).run(sessionId, exerciseId, now);

  return { exerciseId, sessionId };
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

  it('measurementTypeのバックフィル: 0010適用前からある既存データ(アップグレード想定)を種目ごとに正しく分類する', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // 0009までを適用した「アップグレード前の既存インストール」を再現し、
    // measurement_typeカラムが無い状態で手元のexercisesデータを先に入れておく
    const files = migrationFiles();
    const upToPrevious = files.filter((f) => !f.startsWith('0010_'));
    const migration0010 = files.find((f) => f.startsWith('0010_'))!;
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
});
