// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、history-integration.test.tsと
// 同様にbetter-sqlite3で実SQLiteを立て、hooks/use-calendar-month-records.tsが発行するJOINクエリを
// 再現して検証する。単体テスト（day-category.test.ts等）はJS側の集計ロジックしか見ておらず、
// SQL側の境界条件（日付範囲の閉区間/開区間、進行中セッション・未確定セットの除外）は
// ここでしか確認できない。
// 注意: use-calendar-month-records.ts側のクエリ・カラムを変更した場合はこのヘルパーも
// 合わせて更新すること（自動追従はしない）
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { aggregateDailyPrimaryCategory } from '@/lib/calendar/day-category';
import { toDateKey } from '@/lib/calendar/date-grid';

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

// endedAtを省略(undefined)すると進行中セッション(ended_at IS NULL)として作られる
function insertSession(db: Database.Database, startedAt: number, endedAt?: number): number {
  db.prepare(
    `INSERT INTO workout_sessions (started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(startedAt, endedAt ?? null, startedAt, startedAt);
  return (
    db.prepare('SELECT id FROM workout_sessions ORDER BY id DESC LIMIT 1').get() as { id: number }
  ).id;
}

function insertCard(db: Database.Database, sessionId: number, exerciseId: number, orderIndex: number): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(sessionId, exerciseId, orderIndex, now);
  return (
    db.prepare('SELECT id FROM workout_session_exercises ORDER BY id DESC LIMIT 1').get() as {
      id: number;
    }
  ).id;
}

// completedを省略(false)すると✓未確定セット(completed_at IS NULL)として作られる
function insertSet(
  db: Database.Database,
  sessionId: number,
  exerciseId: number,
  wseId: number,
  setNumber: number,
  completed: boolean,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
     VALUES (?, ?, ?, ?, 40, 10, ?, ?)`,
  ).run(sessionId, exerciseId, wseId, setNumber, completed ? now : null, now);
}

// hooks/use-calendar-month-records.ts の useCalendarMonthRecords が発行するSQLをそのままミラーし、
// 同じJS変換(toDateKey + aggregateDailyPrimaryCategory)を通す
function getCalendarMonthRecordsSql(db: Database.Database, startMs: number, endMs: number): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT ws.started_at AS startedAt, e.category AS category
       FROM sets s
       JOIN workout_session_exercises wse ON s.workout_session_exercise_id = wse.id
       JOIN workout_sessions ws ON wse.session_id = ws.id
       JOIN exercises e ON wse.exercise_id = e.id
       WHERE ws.started_at >= ? AND ws.started_at < ?
         AND ws.ended_at IS NOT NULL
         AND s.completed_at IS NOT NULL
       ORDER BY ws.started_at ASC, ws.id ASC, wse.order_index ASC`,
    )
    .all(startMs, endMs) as { startedAt: number; category: string }[];

  return aggregateDailyPrimaryCategory(
    rows.map((r) => ({ dateKey: toDateKey(new Date(r.startedAt)), category: r.category })),
  );
}

describe('useCalendarMonthRecordsのSQLクエリ（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('進行中セッション(ended_at IS NULL)は実績に含めない', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const inProgress = insertSession(db, new Date(2026, 6, 16).getTime()); // endedAt省略=進行中
    const card = insertCard(db, inProgress, chest, 0);
    insertSet(db, inProgress, chest, card, 1, true);

    const result = getCalendarMonthRecordsSql(db, 0, Number.MAX_SAFE_INTEGER);
    expect(result.size).toBe(0);
  });

  it('✓未確定セット(completed_at IS NULL)は実績に含めない', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const session = insertSession(db, new Date(2026, 6, 16).getTime(), new Date(2026, 6, 16, 1).getTime());
    const card = insertCard(db, session, chest, 0);
    insertSet(db, session, chest, card, 1, false); // 未確定

    const result = getCalendarMonthRecordsSql(db, 0, Number.MAX_SAFE_INTEGER);
    expect(result.size).toBe(0);
  });

  it('完了済みセッション・確定済みセットは実績として日付キーに反映される', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const session = insertSession(db, new Date(2026, 6, 16).getTime(), new Date(2026, 6, 16, 1).getTime());
    const card = insertCard(db, session, chest, 0);
    insertSet(db, session, chest, card, 1, true);

    const result = getCalendarMonthRecordsSql(db, 0, Number.MAX_SAFE_INTEGER);
    expect(result.get('2026-07-16')).toBe('chest');
  });

  it('startMsちょうどのセッションは含まれる（gte境界）', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const boundary = new Date(2026, 6, 1).getTime();
    const session = insertSession(db, boundary, boundary + 1000);
    const card = insertCard(db, session, chest, 0);
    insertSet(db, session, chest, card, 1, true);

    const result = getCalendarMonthRecordsSql(db, boundary, boundary + 86_400_000 * 31);
    expect(result.size).toBe(1);
  });

  it('endMsちょうどのセッションは含まれない（lt境界、翌月扱い）', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const endExclusive = new Date(2026, 7, 1).getTime(); // 8月1日ちょうど
    const session = insertSession(db, endExclusive, endExclusive + 1000);
    const card = insertCard(db, session, chest, 0);
    insertSet(db, session, chest, card, 1, true);

    const result = getCalendarMonthRecordsSql(db, new Date(2026, 6, 1).getTime(), endExclusive);
    expect(result.size).toBe(0);
  });

  it('範囲外の日付のセッションは含まれない', () => {
    const chest = insertExercise(db, 'ベンチプレス', 'chest');
    const outside = insertSession(db, new Date(2026, 5, 30).getTime(), new Date(2026, 5, 30, 1).getTime());
    const card = insertCard(db, outside, chest, 0);
    insertSet(db, outside, chest, card, 1, true);

    const result = getCalendarMonthRecordsSql(
      db,
      new Date(2026, 6, 1).getTime(),
      new Date(2026, 7, 1).getTime(),
    );
    expect(result.size).toBe(0);
  });

  it('orderIndexが先の種目のカテゴリが「先にやった種目」としてタイブレークに使われる', () => {
    const back = insertExercise(db, 'ラットプルダウン', 'back');
    const arm = insertExercise(db, 'ダンベルカール', 'arm');
    const session = insertSession(db, new Date(2026, 6, 16).getTime(), new Date(2026, 6, 16, 1).getTime());
    // armを先に(orderIndex 0)、backを後に(orderIndex 1)追加。セット数は同数(2)にしてタイを作る
    const armCard = insertCard(db, session, arm, 0);
    insertSet(db, session, arm, armCard, 1, true);
    insertSet(db, session, arm, armCard, 2, true);
    const backCard = insertCard(db, session, back, 1);
    insertSet(db, session, back, backCard, 1, true);
    insertSet(db, session, back, backCard, 2, true);

    const result = getCalendarMonthRecordsSql(db, 0, Number.MAX_SAFE_INTEGER);
    // セット数は同数(2)なので、orderIndexが先(0)のarmが代表カテゴリになる
    expect(result.get('2026-07-16')).toBe('arm');
  });
});
