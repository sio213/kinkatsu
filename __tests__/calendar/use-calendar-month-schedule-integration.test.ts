// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、use-calendar-month-records-integration.test.ts
// と同様にbetter-sqlite3で実SQLiteを立て、hooks/use-calendar-month-schedule.tsが発行するJOINクエリを
// 再現して検証する。__tests__/calendar/use-calendar-month-schedule.test.tsはdrizzle-orm/expo-sqlite自体を
// 丸ごとモックしているため、WHERE句（routine_id IS NOT NULL・enabled=1）やJOINキーを実装から削除・
// 取り違えてもテストが検知できない構造上の穴がある。ここでは実SQLを直接実行することでその穴を埋める。
// 注意: use-calendar-month-schedule.ts側のクエリ・カラムを変更した場合はこのヘルパーも
// 合わせて更新すること（自動追従はしない）
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { pickRoutineRepresentativeCategories, type RoutineExerciseCategoryRow } from '@/lib/calendar/schedule';

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

function insertExercise(db: Database.Database, name: string, category: string): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES (?, ?, 'custom', 'weight_reps', ?, ?)`,
  ).run(name, category, now, now);
  return (db.prepare('SELECT id FROM exercises WHERE name = ?').get(name) as { id: number }).id;
}

function insertRoutine(db: Database.Database, name: string): number {
  const now = Date.now();
  db.prepare(`INSERT INTO routines (name, order_index, created_at, updated_at) VALUES (?, 0, ?, ?)`).run(name, now, now);
  return (db.prepare('SELECT id FROM routines ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
}

function insertRoutineExercise(db: Database.Database, routineId: number, exerciseId: number, orderIndex: number): void {
  db.prepare(
    `INSERT INTO routine_exercises (routine_id, exercise_id, order_index, created_at) VALUES (?, ?, ?, ?)`,
  ).run(routineId, exerciseId, orderIndex, Date.now());
}

function insertReminder(
  db: Database.Database,
  opts: { routineId: number | null; title: string; enabled: boolean; kind?: string; hour?: number; minute?: number },
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO reminders (routine_id, title, body, kind, hour, minute, interval_days, enabled, created_at, updated_at)
     VALUES (?, ?, 'body', ?, ?, ?, 1, ?, ?, ?)`,
  ).run(opts.routineId, opts.title, opts.kind ?? 'interval', opts.hour ?? 7, opts.minute ?? 0, opts.enabled ? 1 : 0, now, now);
}

// hooks/use-calendar-month-schedule.tsのuseCalendarMonthScheduleが発行するSQLをそのままミラーする
function getScheduleRowsSql(db: Database.Database): { routineId: number; exerciseCategory: string; exerciseOrderIndex: number }[] {
  return db
    .prepare(
      `SELECT r.routine_id AS routineId, e.category AS exerciseCategory, re.order_index AS exerciseOrderIndex
       FROM reminders r
       JOIN routine_exercises re ON re.routine_id = r.routine_id
       JOIN exercises e ON e.id = re.exercise_id
       WHERE r.enabled = 1 AND r.routine_id IS NOT NULL`,
    )
    .all() as { routineId: number; exerciseCategory: string; exerciseOrderIndex: number }[];
}

describe('useCalendarMonthScheduleのSQLクエリ（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('単体リマインダー(routine_id IS NULL)は結果に含まれない', () => {
    insertReminder(db, { routineId: null, title: 'プロテインを飲む', enabled: true });

    const rows = getScheduleRowsSql(db);
    expect(rows).toHaveLength(0);
  });

  it('無効化されたリマインダー(enabled=0)はルーティン紐付きでも結果に含まれない', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const routineId = insertRoutine(db, '胸の日');
    insertRoutineExercise(db, routineId, chest, 0);
    insertReminder(db, { routineId, title: '胸の日', enabled: false });

    const rows = getScheduleRowsSql(db);
    expect(rows).toHaveLength(0);
  });

  it('種目が1件も無いルーティン(routine_exercisesが空)のリマインダーは結果に含まれない(inner join)', () => {
    const routineId = insertRoutine(db, '空のルーティン');
    insertReminder(db, { routineId, title: '空のルーティン', enabled: true });

    const rows = getScheduleRowsSql(db);
    expect(rows).toHaveLength(0);
  });

  it('有効かつルーティン紐付きのリマインダーは、種目数分の行として結果に含まれる', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const shoulder = insertExercise(db, 'ショルダープレス', 'shoulder');
    const routineId = insertRoutine(db, '胸の日');
    insertRoutineExercise(db, routineId, chest, 0);
    insertRoutineExercise(db, routineId, shoulder, 1);
    insertReminder(db, { routineId, title: '胸の日', enabled: true });

    const rows = getScheduleRowsSql(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.exerciseCategory).sort()).toEqual(['chest', 'shoulder']);
  });

  it('複数ルーティンでもJOINキーが正しく対応する（取り違えを検出）', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const leg = insertExercise(db, 'スクワット', 'leg');
    const chestRoutineId = insertRoutine(db, '胸の日');
    const legRoutineId = insertRoutine(db, '脚の日');
    insertRoutineExercise(db, chestRoutineId, chest, 0);
    insertRoutineExercise(db, legRoutineId, leg, 0);
    insertReminder(db, { routineId: chestRoutineId, title: '胸の日', enabled: true });
    insertReminder(db, { routineId: legRoutineId, title: '脚の日', enabled: true });

    const rows = getScheduleRowsSql(db);
    const byRoutine = new Map(rows.map((r) => [r.routineId, r.exerciseCategory]));
    // JOINキーが取り違っていれば胸ルーティンの行にlegが、脚ルーティンの行にchestが混入する
    expect(byRoutine.get(chestRoutineId)).toBe('chest');
    expect(byRoutine.get(legRoutineId)).toBe('leg');

    // 実際のフックと同じ集計関数に通しても正しく対応することを確認
    const categoryRows: RoutineExerciseCategoryRow[] = rows.map((r) => ({
      routineId: r.routineId,
      category: r.exerciseCategory,
      orderIndex: r.exerciseOrderIndex,
    }));
    const representative = pickRoutineRepresentativeCategories(categoryRows);
    expect(representative.get(chestRoutineId)).toBe('chest');
    expect(representative.get(legRoutineId)).toBe('leg');
  });
});
