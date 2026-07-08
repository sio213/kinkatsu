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

// lib/workout/history.ts の getPastTrainingSessions が発行するクエリをそのままミラーしたもの。
// 注意: getPastTrainingSessions側のクエリ・カラムを変更した場合はこのヘルパーも合わせて更新すること
function getPastTrainingSessionsSql(
  db: Database.Database,
  excludeSessionId: number,
): { sessionId: number; startedAt: number; exercises: { exerciseId: number; name: string; category: string }[] }[] {
  const cards = db
    .prepare(
      `SELECT wse.session_id AS sessionId, ws.started_at AS startedAt, wse.id AS workoutSessionExerciseId,
              e.id AS exerciseId, e.name AS name, e.category AS category
       FROM workout_session_exercises wse
       JOIN workout_sessions ws ON wse.session_id = ws.id
       JOIN exercises e ON wse.exercise_id = e.id
       WHERE wse.session_id != ? AND ws.ended_at IS NOT NULL
       ORDER BY ws.started_at DESC, wse.order_index ASC`,
    )
    .all(excludeSessionId) as {
    sessionId: number;
    startedAt: number;
    workoutSessionExerciseId: number;
    exerciseId: number;
    name: string;
    category: string;
  }[];

  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const placeholders = cardIds.map(() => '?').join(',');
  const confirmed = db
    .prepare(
      `SELECT DISTINCT workout_session_exercise_id AS workoutSessionExerciseId
       FROM sets
       WHERE workout_session_exercise_id IN (${placeholders}) AND completed_at IS NOT NULL`,
    )
    .all(...cardIds) as { workoutSessionExerciseId: number }[];
  const confirmedIds = new Set(confirmed.map((c) => c.workoutSessionExerciseId));

  const sessionsById = new Map<
    number,
    { sessionId: number; startedAt: number; exercises: { exerciseId: number; name: string; category: string }[] }
  >();
  for (const c of cards) {
    if (!confirmedIds.has(c.workoutSessionExerciseId)) continue;
    let entry = sessionsById.get(c.sessionId);
    if (!entry) {
      entry = { sessionId: c.sessionId, startedAt: c.startedAt, exercises: [] };
      sessionsById.set(c.sessionId, entry);
    }
    entry.exercises.push({ exerciseId: c.exerciseId, name: c.name, category: c.category });
  }
  return Array.from(sessionsById.values());
}

describe('getPastTrainingSessions（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('過去の記録が無ければ空配列を返す', () => {
    const currentSession = insertSession(db, Date.now());
    expect(getPastTrainingSessionsSql(db, currentSession)).toEqual([]);
  });

  it('終了済みセッションを新しい順（startedAt降順）で返し、各セッション内の種目はorderIndex順', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const squat = insertExercise(db, 'スクワット');
    const older = insertSession(db, 1000);
    endSession(db, older, 1500);
    const olderCard = insertCard(db, older, squat, 0);
    insertSet(db, older, squat, olderCard, 1, 100, 5, true);

    const newer = insertSession(db, 2000);
    endSession(db, newer, 2500);
    const newerCard1 = insertCard(db, newer, bench, 1); // 先にorderIndex=1で追加
    insertSet(db, newer, bench, newerCard1, 1, 60, 10, true);
    const newerCard0 = insertCard(db, newer, squat, 0);
    insertSet(db, newer, squat, newerCard0, 1, 100, 5, true);

    const currentSession = insertSession(db, 3000);
    const result = getPastTrainingSessionsSql(db, currentSession);

    expect(result.map((d) => d.sessionId)).toEqual([newer, older]);
    // newerセッション内はDBの追加順(orderIndex)に関わらずorderIndex=0のsquatが先
    expect(result[0].exercises.map((e) => e.name)).toEqual(['スクワット', 'ベンチプレス']);
    expect(result[1].exercises.map((e) => e.name)).toEqual(['スクワット']);
  });

  it('進行中セッション（ended_at IS NULL）は除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const inProgress = insertSession(db, 1000);
    const card = insertCard(db, inProgress, exerciseId, 0);
    insertSet(db, inProgress, exerciseId, card, 1, 60, 10, true);
    const currentSession = insertSession(db, 2000);

    expect(getPastTrainingSessionsSql(db, currentSession)).toEqual([]);
  });

  it('✓確定セットが1件も無いカードは種目一覧から除外し、全カードがそれに該当すればセッション自体も除外する', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const squat = insertExercise(db, 'スクワット');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const benchCard = insertCard(db, past, bench, 0);
    insertSet(db, past, bench, benchCard, 1, 60, 10, true);
    const squatCard = insertCard(db, past, squat, 1);
    insertSet(db, past, squat, squatCard, 1, 100, 5, false); // ✓未確定のまま
    const currentSession = insertSession(db, 2000);

    const result = getPastTrainingSessionsSql(db, currentSession);
    expect(result).toHaveLength(1);
    expect(result[0].exercises.map((e) => e.name)).toEqual(['ベンチプレス']);
  });

  it('セット行が1件も無いカード（追加しただけの空カード）も除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    insertCard(db, past, exerciseId, 0); // insertSetを一度も呼ばない
    const currentSession = insertSession(db, 2000);

    expect(getPastTrainingSessionsSql(db, currentSession)).toEqual([]);
  });

  it('excludeSessionId自身のセッションは除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const currentSession = insertSession(db, 1000);
    const card = insertCard(db, currentSession, exerciseId, 0);
    insertSet(db, currentSession, exerciseId, card, 1, 60, 10, true);

    expect(getPastTrainingSessionsSql(db, currentSession)).toEqual([]);
  });

  it('1つのセッションに複数カテゴリの種目があれば、それぞれのカテゴリ情報を保持したまま返す', () => {
    const bench = insertExercise(db, 'ベンチプレス'); // category='core'固定のinsertExerciseとは別に個別指定
    db.prepare(`UPDATE exercises SET category = 'chest' WHERE id = ?`).run(bench);
    const squat = insertExercise(db, 'スクワット');
    db.prepare(`UPDATE exercises SET category = 'leg' WHERE id = ?`).run(squat);
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const benchCard = insertCard(db, past, bench, 0);
    insertSet(db, past, bench, benchCard, 1, 60, 10, true);
    const squatCard = insertCard(db, past, squat, 1);
    insertSet(db, past, squat, squatCard, 1, 100, 5, true);
    const currentSession = insertSession(db, 2000);

    const result = getPastTrainingSessionsSql(db, currentSession);
    expect(result[0].exercises.map((e) => e.category)).toEqual(['chest', 'leg']);
  });

  it('同じ種目が同じセッション内に複数カード（ウォームアップ+本番）あれば、その種目名がカード数だけ重複して並ぶ（画面側での表示のまとめ方は別途デザイン判断）', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const past = insertSession(db, 1000);
    endSession(db, past, 1500);
    const warmupCard = insertCard(db, past, bench, 0);
    insertSet(db, past, bench, warmupCard, 1, 40, 12, true);
    const mainCard = insertCard(db, past, bench, 1);
    insertSet(db, past, bench, mainCard, 1, 80, 5, true);
    const currentSession = insertSession(db, 2000);

    const result = getPastTrainingSessionsSql(db, currentSession);
    expect(result[0].exercises.map((e) => e.name)).toEqual(['ベンチプレス', 'ベンチプレス']);
  });

  it('同じ暦日に2つの終了済みセッションがあっても1件に統合せず、セッション単位で別エントリとして返す', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const morning = insertSession(db, new Date(2026, 6, 3, 7, 0).getTime());
    endSession(db, morning, new Date(2026, 6, 3, 8, 0).getTime());
    const morningCard = insertCard(db, morning, bench, 0);
    insertSet(db, morning, bench, morningCard, 1, 60, 10, true);

    const evening = insertSession(db, new Date(2026, 6, 3, 19, 0).getTime());
    endSession(db, evening, new Date(2026, 6, 3, 20, 0).getTime());
    const eveningCard = insertCard(db, evening, bench, 0);
    insertSet(db, evening, bench, eveningCard, 1, 80, 5, true);

    const currentSession = insertSession(db, new Date(2026, 6, 4).getTime());
    const result = getPastTrainingSessionsSql(db, currentSession);

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.sessionId)).toEqual([evening, morning]);
  });
});

// lib/workout/history.ts の getSessionExerciseCards が発行するクエリをそのままミラーしたもの。
// 注意: getSessionExerciseCards側のクエリ・カラムを変更した場合はこのヘルパーも合わせて更新すること
function getSessionExerciseCardsSql(
  db: Database.Database,
  sessionId: number,
): {
  workoutSessionExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: {
    setNumber: number;
    weight: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    completedAt: number | null;
  }[];
}[] {
  const cards = db
    .prepare(
      `SELECT wse.id AS workoutSessionExerciseId, e.id AS exerciseId, e.name AS name, e.category AS category,
              e.measurement_type AS measurementType, e.source AS source, e.slug AS slug
       FROM workout_session_exercises wse
       JOIN exercises e ON wse.exercise_id = e.id
       WHERE wse.session_id = ?
       ORDER BY wse.order_index ASC`,
    )
    .all(sessionId) as {
    workoutSessionExerciseId: number;
    exerciseId: number;
    name: string;
    category: string;
    measurementType: string;
    source: string;
    slug: string | null;
  }[];

  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const placeholders = cardIds.map(() => '?').join(',');
  const allSets = db
    .prepare(
      `SELECT workout_session_exercise_id AS wseId, set_number AS setNumber, weight, reps,
              duration_seconds AS durationSeconds, distance_meters AS distanceMeters,
              completed_at AS completedAt
       FROM sets
       WHERE workout_session_exercise_id IN (${placeholders})
       ORDER BY set_number`,
    )
    .all(...cardIds) as {
    wseId: number;
    setNumber: number;
    weight: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    completedAt: number | null;
  }[];

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
      ...c,
      sets: (setsByCard.get(c.workoutSessionExerciseId) ?? []).map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        completedAt: s.completedAt,
      })),
    }))
    .filter((card) => card.sets.some((s) => s.completedAt != null));
}

describe('getSessionExerciseCards（実SQLite）', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('指定セッションのカードをorderIndex順で返す', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const squat = insertExercise(db, 'スクワット');
    const session = insertSession(db, 1000);
    const card1 = insertCard(db, session, bench, 1);
    insertSet(db, session, bench, card1, 1, 60, 10, true);
    const card0 = insertCard(db, session, squat, 0);
    insertSet(db, session, squat, card0, 1, 100, 5, true);

    const result = getSessionExerciseCardsSql(db, session);
    expect(result.map((c) => c.name)).toEqual(['スクワット', 'ベンチプレス']);
  });

  it('✓確定セットが1件も無いカードは除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const session = insertSession(db, 1000);
    const card = insertCard(db, session, exerciseId, 0);
    insertSet(db, session, exerciseId, card, 1, 60, 10, false); // ✓未確定のまま

    expect(getSessionExerciseCardsSql(db, session)).toEqual([]);
  });

  it('セット行が1件も無いカード（追加しただけの空カード）も除外する', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const session = insertSession(db, 1000);
    insertCard(db, session, exerciseId, 0); // insertSetを一度も呼ばない

    expect(getSessionExerciseCardsSql(db, session)).toEqual([]);
  });

  it('他セッションのカードは含まれない', () => {
    const exerciseId = insertExercise(db, 'ベンチプレス');
    const session = insertSession(db, 1000);
    const otherSession = insertSession(db, 2000);
    const otherCard = insertCard(db, otherSession, exerciseId, 0);
    insertSet(db, otherSession, exerciseId, otherCard, 1, 60, 10, true);

    expect(getSessionExerciseCardsSql(db, session)).toEqual([]);
  });

  it('複数カード混在時もセット内容が正しいカードに紐づき、混ざらない', () => {
    const bench = insertExercise(db, 'ベンチプレス');
    const squat = insertExercise(db, 'スクワット');
    const session = insertSession(db, 1000);
    const benchCard = insertCard(db, session, bench, 0);
    insertSet(db, session, bench, benchCard, 1, 60, 10, true);
    const squatCard = insertCard(db, session, squat, 1);
    insertSet(db, session, squat, squatCard, 1, 100, 5, true);

    const result = getSessionExerciseCardsSql(db, session);
    const benchResult = result.find((c) => c.workoutSessionExerciseId === benchCard)!;
    const squatResult = result.find((c) => c.workoutSessionExerciseId === squatCard)!;
    expect(benchResult.sets).toEqual([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: expect.any(Number) },
    ]);
    expect(squatResult.sets).toEqual([
      { setNumber: 1, weight: 100, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: expect.any(Number) },
    ]);
    expect(benchResult.measurementType).toBe('weight_reps');
  });

  it('measurementTypeが未知の値でもフィルタされず、そのままstringで返る（画面側フォールバックの前提を保証）', () => {
    const exerciseId = insertExercise(db, '謎の種目');
    db.prepare(`UPDATE exercises SET measurement_type = 'legacy_unknown' WHERE id = ?`).run(exerciseId);
    const session = insertSession(db, 1000);
    const card = insertCard(db, session, exerciseId, 0);
    insertSet(db, session, exerciseId, card, 1, 60, 10, true);

    const result = getSessionExerciseCardsSql(db, session);
    expect(result[0].measurementType).toBe('legacy_unknown');
  });
});
