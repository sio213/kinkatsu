// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、schema-fk-integration.test.tsと同様に
// better-sqlite3で実SQLiteを立て、ルーティン関連テーブルのFK制約(cascade/restrict/set null)が
// マイグレーションSQL通りに効くことを検証する。lib/routines/db.tsの各関数はモック化したdb.test.tsで
// 呼び出し順を確認するに留め、実際のカスケード挙動の保証はこちらが担う。
//
// duplicateRoutineのorderIndexシフト(sql`${routines.orderIndex} + 1`)だけは例外的に、
// drizzle-orm/better-sqlite3の実クエリビルダ経由で検証する(db.test.tsはsql自体をモックしており、
// このコードベースで初めて使うsqlタグ付きテンプレートが実際に正しいSQLへコンパイルされるかは
// カバーできていないため。db/schema.tsはexpo-sqlite非依存なのでこの用途にそのまま使える)
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { gt, sql } from 'drizzle-orm';
import { routines } from '@/db/schema';
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
    // drizzle-ormのsqlタグ関数(import済み)とのシャドーイングを避けるためsqlTextという名前にする
    const sqlText = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
    db.exec(sqlText.replace(/--> statement-breakpoint/g, ''));
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

  // getRoutineDetail()が実際に発行するSQL（routine_exercises INNER JOIN exercises、
  // order_index/set_number順）を、lib/routines/db.tsのTS関数を直接呼ばず（db/client.tsが
  // expo-sqlite依存でjest環境では動かせないため）、同じSQLを実SQLite上で再現して検証する。
  // 他の統合テストと同じ「SQLをミラーする」方針
  it('getRoutineDetail相当のJOIN: routine_exercisesとexercisesを結合すると種目メタ情報(name/category/measurement_type/source/slug)が正しく引ける', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const { routineId } = seedRoutineWithExerciseAndSets(db);

    const rows = db
      .prepare(
        `SELECT re.exercise_id, e.name, e.category, e.measurement_type, e.source, e.slug
         FROM routine_exercises re
         INNER JOIN exercises e ON re.exercise_id = e.id
         WHERE re.routine_id = ?
         ORDER BY re.order_index`,
      )
      .all(routineId) as {
      exercise_id: number;
      name: string;
      category: string;
      measurement_type: string;
      source: string;
      slug: string | null;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ name: '自作種目', category: 'core', measurement_type: 'weight_reps', source: 'custom' }),
    );
  });

  it('getRoutineDetail相当のJOIN: 複数種目・複数セットでもorder_index/set_number順に正しく並ぶ', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const now = Date.now();

    db.prepare(
      `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
       VALUES ('種目A', 'chest', 'preset', 'weight_reps', ?, ?), ('種目B', 'leg', 'preset', 'weight_reps', ?, ?)`,
    ).run(now, now, now, now);
    const exerciseIds = (db.prepare('SELECT id FROM exercises ORDER BY id').all() as { id: number }[]).map((r) => r.id);

    db.prepare(`INSERT INTO routines (name, order_index, created_at, updated_at) VALUES ('全身の日', 0, ?, ?)`).run(now, now);
    const routineId = (db.prepare('SELECT id FROM routines').get() as { id: number }).id;

    // わざと種目Bを先(order_index=0)、種目Aを後(order_index=1)に登録し、INSERT順ではなく
    // order_index順で返ることを確認する
    db.prepare(
      `INSERT INTO routine_exercises (routine_id, exercise_id, order_index, created_at) VALUES (?, ?, 1, ?), (?, ?, 0, ?)`,
    ).run(routineId, exerciseIds[0], now, routineId, exerciseIds[1], now);

    const rows = db
      .prepare(
        `SELECT e.name FROM routine_exercises re
         INNER JOIN exercises e ON re.exercise_id = e.id
         WHERE re.routine_id = ?
         ORDER BY re.order_index`,
      )
      .all(routineId) as { name: string }[];

    expect(rows.map((r) => r.name)).toEqual(['種目B', '種目A']);
  });

  it('duplicateRoutine相当のorderIndexシフト: sql`${routines.orderIndex} + 1`は各行の現在値を基準に+1し、後続行だけが対象になる', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
    const now = Date.now();
    db.prepare(
      `INSERT INTO routines (name, order_index, created_at, updated_at)
       VALUES ('A', 0, ?, ?), ('B', 1, ?, ?), ('C', 2, ?, ?)`,
    ).run(now, now, now, now, now, now);

    const orm = drizzle(db);
    orm
      .update(routines)
      .set({ orderIndex: sql`${routines.orderIndex} + 1` })
      .where(gt(routines.orderIndex, 0))
      .run();

    const rows = db.prepare('SELECT name, order_index AS orderIndex FROM routines ORDER BY name').all() as {
      name: string;
      orderIndex: number;
    }[];
    // Aはgtの対象外なので0のまま、B/Cはそれぞれ自分の現在値+1になる(全行が同じ値に
    // 揃ってしまう固定値updateとの違いを確認する)
    expect(rows).toEqual([
      { name: 'A', orderIndex: 0 },
      { name: 'B', orderIndex: 2 },
      { name: 'C', orderIndex: 3 },
    ]);
  });
});
