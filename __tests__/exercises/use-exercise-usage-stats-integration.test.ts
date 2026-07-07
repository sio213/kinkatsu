// hooks/use-exercise-usage-stats.ts の useExerciseUsageStats() が発行する集計SQL
// （count(distinct case when startedAt >= since then session_id end)/max(startedAt)/
// groupBy exerciseId）をそのまま再現し、実SQLite上でwindow境界・JOIN・複数カードの
// 集計が正しく動くかを検証する。モック（use-exercise-usage-stats.test.ts）は
// 行データ→Map変換のロジックしか検証できないため、集計そのものの正しさはここでしか担保できない
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

function insertExercise(db: Database.Database, name: string): number {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES (?, 'core', 'custom', 'weight_reps', ?, ?)`,
  ).run(name, now, now);
  return (db.prepare('SELECT id FROM exercises WHERE name = ?').get(name) as { id: number }).id;
}

function insertSession(db: Database.Database, startedAt: number): number {
  db.prepare(
    `INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`,
  ).run(startedAt, startedAt, startedAt);
  return (
    db.prepare('SELECT id FROM workout_sessions ORDER BY id DESC LIMIT 1').get() as { id: number }
  ).id;
}

function insertCard(db: Database.Database, sessionId: number, exerciseId: number, orderIndex: number): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO workout_session_exercises (session_id, exercise_id, order_index, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(sessionId, exerciseId, orderIndex, now);
}

// use-exercise-usage-stats.ts の useLiveQuery が発行するクエリと同じ集計SQL。
// excludeSessionIdが指定されたときだけWHERE句を足す（drizzleの
// .where(cond ?? undefined)でWHERE句自体が省略されるのと同じ挙動）
function usageStatsSql(excludeSessionId?: number): string {
  const whereClause = excludeSessionId != null ? 'WHERE wse.session_id != ?' : '';
  return `
    SELECT
      wse.exercise_id AS exerciseId,
      COUNT(DISTINCT CASE WHEN ws.started_at >= ? THEN ws.id END) AS recentUsageCount,
      MAX(ws.started_at) AS lastUsedAt
    FROM workout_session_exercises wse
    INNER JOIN workout_sessions ws ON wse.session_id = ws.id
    ${whereClause}
    GROUP BY wse.exercise_id
  `;
}

type UsageStatsRow = { exerciseId: number; recentUsageCount: number; lastUsedAt: number };

function queryUsageStats(db: Database.Database, since: number, excludeSessionId?: number): UsageStatsRow[] {
  const params = excludeSessionId != null ? [since, excludeSessionId] : [since];
  return db.prepare(usageStatsSql(excludeSessionId)).all(...params) as UsageStatsRow[];
}

describe('useExerciseUsageStats相当の集計SQL（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('sinceちょうどのセッションはrecentUsageCountに含まれる（>=境界）', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const since = 10_000;
    const sessionId = insertSession(db, since);
    insertCard(db, sessionId, exerciseId, 0);

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(1);
    expect(row.lastUsedAt).toBe(since);
  });

  it('sinceの1ms前のセッションはrecentUsageCountに含まれない（lastUsedAtには反映される）', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const since = 10_000;
    const sessionId = insertSession(db, since - 1);
    insertCard(db, sessionId, exerciseId, 0);

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(0);
    expect(row.lastUsedAt).toBe(since - 1);
  });

  it('新旧セッションが混在する種目は、recentUsageCountが窓内の件数のみ・lastUsedAtは全期間の最大値になる', () => {
    const exerciseId = insertExercise(db, 'スクワット');
    const since = 10_000;
    insertCard(db, insertSession(db, since - 5_000), exerciseId, 0); // 窓外
    insertCard(db, insertSession(db, since + 1_000), exerciseId, 0); // 窓内
    insertCard(db, insertSession(db, since + 5_000), exerciseId, 0); // 窓内・最新

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(2);
    expect(row.lastUsedAt).toBe(since + 5_000);
  });

  it('1セッション内に同じ種目を複数カード追加しても、recentUsageCountはセッション数(=1)のまま水増しされない（duplicate-exercises仕様との併用）', () => {
    const exerciseId = insertExercise(db, 'プランク');
    const since = 10_000;
    const sessionId = insertSession(db, since);
    insertCard(db, sessionId, exerciseId, 0);
    insertCard(db, sessionId, exerciseId, 1);

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(1);
  });

  it('複数セッションにまたがって使えば、各セッション内のカード枚数によらずセッション数分だけカウントされる', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const since = 10_000;
    const sessionA = insertSession(db, since);
    insertCard(db, sessionA, exerciseId, 0);
    insertCard(db, sessionA, exerciseId, 1); // 同セッション内の2枚目
    const sessionB = insertSession(db, since + 1_000);
    insertCard(db, sessionB, exerciseId, 0);

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(2);
  });

  it('一度もworkout_session_exercisesに現れない種目は結果行に出現しない', () => {
    insertExercise(db, '未使用種目');
    const other = insertExercise(db, 'ベンチプレス');
    insertCard(db, insertSession(db, 10_000), other, 0);

    const rows = queryUsageStats(db, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseId).toBe(other);
  });

  it('終了していないセッション（endedAtがnull）のカードも実績に含まれる', () => {
    const exerciseId = insertExercise(db, 'デッドリフト');
    const since = 10_000;
    // endedAtを指定しない = NULL（進行中セッション）
    const sessionId = insertSession(db, since);
    insertCard(db, sessionId, exerciseId, 0);

    const endedAt = db
      .prepare('SELECT ended_at AS endedAt FROM workout_sessions WHERE id = ?')
      .get(sessionId) as { endedAt: number | null };
    expect(endedAt.endedAt).toBeNull();

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(1);
  });

  it('excludeSessionIdを渡すと、そのセッションの分がrecentUsageCount・lastUsedAtの両方から除外される（進行中セッションで今追加した種目が「最近使った順」の最上位に来てしまう問題への対応）', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const since = 10_000;
    const pastSession = insertSession(db, since + 1_000);
    insertCard(db, pastSession, exerciseId, 0);
    // 今まさに種目を追加している進行中セッション。startedAtが最新でも実績集計からは除く
    const currentSession = insertSession(db, since + 9_999);
    insertCard(db, currentSession, exerciseId, 0);

    const [row] = queryUsageStats(db, since, currentSession);
    expect(row.recentUsageCount).toBe(1);
    expect(row.lastUsedAt).toBe(since + 1_000);
  });

  it('excludeSessionIdが唯一の使用実績だった場合、その種目は結果行に出現しない', () => {
    const exerciseId = insertExercise(db, 'デッドリフト');
    const currentSession = insertSession(db, 10_000);
    insertCard(db, currentSession, exerciseId, 0);

    const rows = queryUsageStats(db, 0, currentSession);
    expect(rows.find((r) => r.exerciseId === exerciseId)).toBeUndefined();
  });

  it('excludeSessionIdを渡さない場合は従来どおり全セッションが対象になる（後方互換）', () => {
    const exerciseId = insertExercise(db, 'スクワット');
    const since = 10_000;
    insertCard(db, insertSession(db, since), exerciseId, 0);

    const [row] = queryUsageStats(db, since);
    expect(row.recentUsageCount).toBe(1);
  });
});
