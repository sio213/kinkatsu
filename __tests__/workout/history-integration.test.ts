// db/client.ts はexpo-sqlite依存でjest環境では動かせないため、session-sets-integration.test.tsと
// 同様にbetter-sqlite3で実SQLiteを立て、lib/workout/history.tsのgetPreviousSetsが発行するJOINクエリを
// 再現して検証する。モック（session.test.ts）はgetPreviousSets自体を差し替えているため、
// 実際のJOIN条件・タイブレークがSQLite上で正しく機能するかはここでしか確認できない。
// 注意: getPreviousSets側のクエリ・カラムを変更した場合はこのヘルパーも合わせて更新すること（自動追従はしない）
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

function insertExercise(db: Database.Database, name: string) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO exercises (name, category, source, measurement_type, created_at, updated_at)
     VALUES (?, 'core', 'custom', 'weight_reps', ?, ?)`,
  ).run(name, now, now);
  return (db.prepare('SELECT id FROM exercises WHERE name = ?').get(name) as { id: number }).id;
}

function insertSession(db: Database.Database, startedAt: number) {
  db.prepare(
    `INSERT INTO workout_sessions (started_at, created_at, updated_at) VALUES (?, ?, ?)`,
  ).run(startedAt, startedAt, startedAt);
  return (
    db.prepare('SELECT id FROM workout_sessions ORDER BY id DESC LIMIT 1').get() as { id: number }
  ).id;
}

function insertCard(db: Database.Database, sessionId: number, exerciseId: number, orderIndex: number) {
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

function insertSet(
  db: Database.Database,
  sessionId: number,
  exerciseId: number,
  wseId: number,
  setNumber: number,
  weight: number | null,
  reps: number | null,
  completed: boolean,
) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO sets (session_id, exercise_id, workout_session_exercise_id, set_number, weight, reps, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, exerciseId, wseId, setNumber, weight, reps, completed ? now : null, now);
}

// lib/workout/history.ts の getPreviousSets が発行するSQLをそのままミラーしたもの。
// ✓未確定（completed_at IS NULL）のセットも「前回入力した値」として対象に含める
function getPreviousSetsSql(
  db: Database.Database,
  exerciseId: number,
  excludeSessionId: number,
): { setNumber: number; weight: number | null; reps: number | null }[] {
  const latestCard = db
    .prepare(
      `SELECT s.workout_session_exercise_id AS wseId
       FROM sets s
       JOIN workout_session_exercises wse ON s.workout_session_exercise_id = wse.id
       JOIN workout_sessions ws ON wse.session_id = ws.id
       WHERE s.exercise_id = ? AND wse.session_id != ?
       ORDER BY ws.started_at DESC, wse.id DESC
       LIMIT 1`,
    )
    .get(exerciseId, excludeSessionId) as { wseId: number } | undefined;

  if (!latestCard) return [];

  return db
    .prepare(
      `SELECT set_number AS setNumber, weight, reps
       FROM sets
       WHERE workout_session_exercise_id = ?
       ORDER BY set_number`,
    )
    .all(latestCard.wseId) as { setNumber: number; weight: number | null; reps: number | null }[];
}

describe('getPreviousSets（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('過去に記録が無い種目は空配列を返す', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const sessionId = insertSession(db, Date.now());

    expect(getPreviousSetsSql(db, exerciseId, sessionId)).toEqual([]);
  });

  it('別セッションの完了済みセット列をsetNumber順に返す', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const pastSession = insertSession(db, 1000);
    const pastCard = insertCard(db, pastSession, exerciseId, 0);
    insertSet(db, pastSession, exerciseId, pastCard, 1, 60, 10, true);
    insertSet(db, pastSession, exerciseId, pastCard, 2, 60, 8, true);
    const currentSession = insertSession(db, 2000);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([
      { setNumber: 1, weight: 60, reps: 10 },
      { setNumber: 2, weight: 60, reps: 8 },
    ]);
  });

  it('✓未確定（completed_at IS NULL）のセットも前回入力した値として拾う（押し忘れて終了したケースを想定）', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const pastSession = insertSession(db, 1000);
    const pastCard = insertCard(db, pastSession, exerciseId, 0);
    insertSet(db, pastSession, exerciseId, pastCard, 1, 60, 10, false);
    const currentSession = insertSession(db, 2000);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([
      { setNumber: 1, weight: 60, reps: 10 },
    ]);
  });

  it('自分自身（excludeSessionId）のセットは前回の記録として拾わない', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const currentSession = insertSession(db, 1000);
    const currentCard = insertCard(db, currentSession, exerciseId, 0);
    insertSet(db, currentSession, exerciseId, currentCard, 1, 60, 10, true);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([]);
  });

  it('複数の過去セッションがある場合、開始時刻が最も新しいセッションを前回として選ぶ', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const older = insertSession(db, 1000);
    const olderCard = insertCard(db, older, exerciseId, 0);
    insertSet(db, older, exerciseId, olderCard, 1, 55, 10, true);

    const newer = insertSession(db, 2000);
    const newerCard = insertCard(db, newer, exerciseId, 0);
    insertSet(db, newer, exerciseId, newerCard, 1, 62.5, 8, true);

    const currentSession = insertSession(db, 3000);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([
      { setNumber: 1, weight: 62.5, reps: 8 },
    ]);
  });

  it('直近カードが一部✓済み・一部未確定でも、全セットを前回値として返す', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const pastSession = insertSession(db, 1000);
    const pastCard = insertCard(db, pastSession, exerciseId, 0);
    insertSet(db, pastSession, exerciseId, pastCard, 1, 60, 10, true);
    insertSet(db, pastSession, exerciseId, pastCard, 2, 60, 8, true);
    insertSet(db, pastSession, exerciseId, pastCard, 3, 60, 6, false); // 3セット目は✓を押し忘れて離脱
    const currentSession = insertSession(db, 2000);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([
      { setNumber: 1, weight: 60, reps: 10 },
      { setNumber: 2, weight: 60, reps: 8 },
      { setNumber: 3, weight: 60, reps: 6 },
    ]);
  });

  it('直近セッションが丸ごと未確定（放置）でも、より新しい方を前回として採用する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const older = insertSession(db, 1000);
    const olderCard = insertCard(db, older, exerciseId, 0);
    insertSet(db, older, exerciseId, olderCard, 1, 55, 10, true);

    const abandoned = insertSession(db, 2000);
    const abandonedCard = insertCard(db, abandoned, exerciseId, 0);
    insertSet(db, abandoned, exerciseId, abandonedCard, 1, 70, 5, false); // 全部✓を押さずに終了

    const currentSession = insertSession(db, 3000);

    expect(getPreviousSetsSql(db, exerciseId, currentSession)).toEqual([
      { setNumber: 1, weight: 70, reps: 5 },
    ]);
  });

  it('同じ過去セッション内に同じ種目のカードが2枚あっても、他方のセット値と混ざらない', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const pastSession = insertSession(db, 1000);
    const warmupCard = insertCard(db, pastSession, exerciseId, 0);
    insertSet(db, pastSession, exerciseId, warmupCard, 1, 40, 12, true);
    const mainCard = insertCard(db, pastSession, exerciseId, 1);
    insertSet(db, pastSession, exerciseId, mainCard, 1, 80, 5, true);
    const currentSession = insertSession(db, 2000);

    const result = getPreviousSetsSql(db, exerciseId, currentSession);
    // カードid降順のタイブレークにより、後から追加されたカード（本セット）が選ばれ、
    // ウォームアップカードの値と混ざらない
    expect(result).toEqual([{ setNumber: 1, weight: 80, reps: 5 }]);
  });

  it('別の種目の記録は前回の記録として拾わない', () => {
    const benchId = insertExercise(db, 'ベンチプレス');
    const squatId = insertExercise(db, 'スクワット');
    const pastSession = insertSession(db, 1000);
    const squatCard = insertCard(db, pastSession, squatId, 0);
    insertSet(db, pastSession, squatId, squatCard, 1, 100, 5, true);
    const currentSession = insertSession(db, 2000);

    expect(getPreviousSetsSql(db, benchId, currentSession)).toEqual([]);
  });
});

function endSession(db: Database.Database, sessionId: number, endedAt: number) {
  db.prepare('UPDATE workout_sessions SET ended_at = ? WHERE id = ?').run(endedAt, sessionId);
}

// lib/workout/history.ts の getExerciseHistoryEntries が発行するクエリをそのままミラーしたもの。
// 注意: getExerciseHistoryEntries側のクエリ・カラムを変更した場合はこのヘルパーも合わせて更新すること
function getExerciseHistoryEntriesSql(
  db: Database.Database,
  exerciseId: number,
  excludeSessionId: number,
): { workoutSessionExerciseId: number; startedAt: number; sets: { setNumber: number; weight: number | null; reps: number | null; completedAt: number | null }[] }[] {
  const cards = db
    .prepare(
      `SELECT wse.id AS workoutSessionExerciseId, ws.started_at AS startedAt
       FROM workout_session_exercises wse
       JOIN workout_sessions ws ON wse.session_id = ws.id
       WHERE wse.exercise_id = ? AND wse.session_id != ? AND ws.ended_at IS NOT NULL
       ORDER BY ws.started_at DESC, wse.id DESC`,
    )
    .all(exerciseId, excludeSessionId) as { workoutSessionExerciseId: number; startedAt: number }[];

  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const placeholders = cardIds.map(() => '?').join(',');
  const allSets = db
    .prepare(
      `SELECT workout_session_exercise_id AS wseId, set_number AS setNumber, weight, reps, completed_at AS completedAt
       FROM sets
       WHERE workout_session_exercise_id IN (${placeholders})
       ORDER BY set_number`,
    )
    .all(...cardIds) as { wseId: number; setNumber: number; weight: number | null; reps: number | null; completedAt: number | null }[];

  const setsByCard = new Map<number, typeof allSets>();
  for (const s of allSets) {
    const list = setsByCard.get(s.wseId);
    if (list) {
      list.push(s);
    } else {
      setsByCard.set(s.wseId, [s]);
    }
  }

  return cards
    .map((c) => ({
      workoutSessionExerciseId: c.workoutSessionExerciseId,
      startedAt: c.startedAt,
      sets: (setsByCard.get(c.workoutSessionExerciseId) ?? []).map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        completedAt: s.completedAt,
      })),
    }))
    .filter((entry) => entry.sets.some((s) => s.completedAt != null));
}

describe('getExerciseHistoryEntries（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('過去の記録が無い種目は空配列を返す', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const currentSession = insertSession(db, Date.now());

    expect(getExerciseHistoryEntriesSql(db, exerciseId, currentSession)).toEqual([]);
  });

  it('終了済みセッションの過去カードを新しい順（startedAt降順）で返す', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const older = insertSession(db, 1000);
    endSession(db, older, 1500);
    const olderCard = insertCard(db, older, exerciseId, 0);
    insertSet(db, older, exerciseId, olderCard, 1, 55, 10, true);

    const newer = insertSession(db, 2000);
    endSession(db, newer, 2500);
    const newerCard = insertCard(db, newer, exerciseId, 0);
    insertSet(db, newer, exerciseId, newerCard, 1, 62.5, 8, true);

    const currentSession = insertSession(db, 3000);
    const result = getExerciseHistoryEntriesSql(db, exerciseId, currentSession);

    expect(result.map((e) => e.workoutSessionExerciseId)).toEqual([newerCard, olderCard]);
  });

  it('進行中セッション（ended_at IS NULL）のカードは除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const inProgress = insertSession(db, 1000); // endSessionを呼ばない＝進行中のまま
    const card = insertCard(db, inProgress, exerciseId, 0);
    insertSet(db, inProgress, exerciseId, card, 1, 60, 10, true);
    const currentSession = insertSession(db, 2000);

    expect(getExerciseHistoryEntriesSql(db, exerciseId, currentSession)).toEqual([]);
  });

  it('✓確定セットが1件も無いカード（追加しただけで記録しなかった等）は除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const card = insertCard(db, past, exerciseId, 0);
    insertSet(db, past, exerciseId, card, 1, 60, 10, false); // ✓未確定のまま
    const currentSession = insertSession(db, 2000);

    expect(getExerciseHistoryEntriesSql(db, exerciseId, currentSession)).toEqual([]);
  });

  it('一部✓済み・一部未確定が混在するカードはそのまま含まれる（除外条件は「1件でも確定済みがあるか」）', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const card = insertCard(db, past, exerciseId, 0);
    insertSet(db, past, exerciseId, card, 1, 60, 10, true);
    insertSet(db, past, exerciseId, card, 2, 60, 8, false);
    const currentSession = insertSession(db, 2000);

    const result = getExerciseHistoryEntriesSql(db, exerciseId, currentSession);
    expect(result).toHaveLength(1);
    expect(result[0].sets).toEqual([
      { setNumber: 1, weight: 60, reps: 10, completedAt: expect.any(Number) },
      { setNumber: 2, weight: 60, reps: 8, completedAt: null },
    ]);
  });

  it('excludeSessionId自身のセッション内カードは除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const currentSession = insertSession(db, 1000);
    const card = insertCard(db, currentSession, exerciseId, 0);
    insertSet(db, currentSession, exerciseId, card, 1, 60, 10, true);

    expect(getExerciseHistoryEntriesSql(db, exerciseId, currentSession)).toEqual([]);
  });

  it('別の種目のカードは含まれない', () => {
    const benchId = insertExercise(db, 'ベンチプレス');
    const squatId = insertExercise(db, 'スクワット');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const squatCard = insertCard(db, past, squatId, 0);
    insertSet(db, past, squatId, squatCard, 1, 100, 5, true);
    const currentSession = insertSession(db, 2000);

    expect(getExerciseHistoryEntriesSql(db, benchId, currentSession)).toEqual([]);
  });

  it('同一セッション内に同じ種目のカードが2枚あっても、それぞれ別entryとして返りsetsが混ざらない', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const warmupCard = insertCard(db, past, exerciseId, 0);
    insertSet(db, past, exerciseId, warmupCard, 1, 40, 12, true);
    const mainCard = insertCard(db, past, exerciseId, 1);
    insertSet(db, past, exerciseId, mainCard, 1, 80, 5, true);
    const currentSession = insertSession(db, 2000);

    const result = getExerciseHistoryEntriesSql(db, exerciseId, currentSession);
    expect(result).toHaveLength(2);
    const warmupEntry = result.find((e) => e.workoutSessionExerciseId === warmupCard)!;
    const mainEntry = result.find((e) => e.workoutSessionExerciseId === mainCard)!;
    expect(warmupEntry.sets).toEqual([{ setNumber: 1, weight: 40, reps: 12, completedAt: expect.any(Number) }]);
    expect(mainEntry.sets).toEqual([{ setNumber: 1, weight: 80, reps: 5, completedAt: expect.any(Number) }]);
  });
});
