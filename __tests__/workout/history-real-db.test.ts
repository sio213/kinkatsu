// lib/workout/history.ts の「DBを引く4つの関数」を、実SQLite上で本物のまま実行して検証する。
//
// history-integration.test.ts は同じ狙いのテストだが、db/client.ts が expo-sqlite 依存で
// jest では読み込めないため、プロダクションのクエリと同じSQLを手で書き写す方式を取っていた
// （そのぶん lib 側の変更に自動追従しない、と同ファイル冒頭で断ってある）。
// こちらは `@/db/client` の db を better-sqlite3 上の drizzle に差し替えることで、
// getPreviousSets / getExerciseHistoryEntries / getPastTrainingSessions /
// getSessionExerciseCards を「呼び出す」形にしている。SQLの写し違いが起こり得ない。
import type Database from 'better-sqlite3';

jest.mock('@/db/client', () => {
  // jest.mock のファクトリは巻き上げられるため、ヘルパーはこの中で require する
  const { createTestDb } = require('../helpers/test-db');
  const { sqlite, db } = createTestDb();
  return { db, expoDb: sqlite, __sqlite: sqlite };
});

import * as dbClient from '@/db/client';
import {
  getExerciseHistoryEntries,
  getPastTrainingSessions,
  getPreviousSets,
  getSessionExerciseCards,
  NO_SESSION_TO_EXCLUDE,
} from '@/lib/workout/history';
import {
  insertCardWithSets,
  insertExercise,
  insertSession,
  resetTestDb,
  type TestDb,
} from '../helpers/test-db';

const sqlite = (dbClient as unknown as { __sqlite: Database.Database }).__sqlite;
const db = dbClient.db as unknown as TestDb;

const DONE = 1_700_000_000_000;

beforeEach(() => {
  resetTestDb(sqlite);
});

describe('getPreviousSets', () => {
  it('直近セッションのカードのセット列を setNumber 順で返す', async () => {
    const exerciseId = await insertExercise(db, { name: 'ベンチプレス' });
    const older = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const newer = await insertSession(db, { startedAt: 5_000, endedAt: 6_000 });
    await insertCardWithSets(db, {
      sessionId: older,
      exerciseId,
      sets: [{ setNumber: 1, weight: 40, reps: 10, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId: newer,
      exerciseId,
      sets: [
        { setNumber: 2, weight: 60, reps: 8, completedAt: DONE },
        { setNumber: 1, weight: 50, reps: 10, completedAt: DONE },
      ],
    });

    const result = await getPreviousSets(db as never, exerciseId);

    expect(result.map((s) => [s.setNumber, s.weight, s.reps])).toEqual([
      [1, 50, 10],
      [2, 60, 8],
    ]);
  });

  it('✓未確定（completedAt null）のセットも前回の記録として返す', async () => {
    const exerciseId = await insertExercise(db, { name: 'スクワット' });
    const sessionId = await insertSession(db, { startedAt: 1_000 });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId,
      sets: [{ setNumber: 1, weight: 100, reps: 5, completedAt: null }],
    });

    const result = await getPreviousSets(db as never, exerciseId);

    expect(result).toEqual([
      { setNumber: 1, weight: 100, reps: 5, durationSeconds: null, distanceMeters: null },
    ]);
  });

  it('excludeSessionId のセッションは前回として参照しない', async () => {
    const exerciseId = await insertExercise(db, { name: 'デッドリフト' });
    const past = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const current = await insertSession(db, { startedAt: 9_000 });
    await insertCardWithSets(db, {
      sessionId: past,
      exerciseId,
      sets: [{ setNumber: 1, weight: 80, reps: 5, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId: current,
      exerciseId,
      sets: [{ setNumber: 1, weight: 120, reps: 3, completedAt: DONE }],
    });

    const result = await getPreviousSets(db as never, exerciseId, current);

    expect(result.map((s) => s.weight)).toEqual([80]);
  });

  it('同一セッション内に同じ種目のカードが複数あるときは後から追加した方を返す', async () => {
    const exerciseId = await insertExercise(db, { name: 'ラットプルダウン' });
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId,
      orderIndex: 0,
      sets: [{ setNumber: 1, weight: 20, reps: 15, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId,
      orderIndex: 1,
      sets: [{ setNumber: 1, weight: 45, reps: 8, completedAt: DONE }],
    });

    const result = await getPreviousSets(db as never, exerciseId);

    expect(result.map((s) => s.weight)).toEqual([45]);
  });

  it('記録が1件も無ければ空配列を返す', async () => {
    const exerciseId = await insertExercise(db, { name: '未実施の種目' });

    expect(await getPreviousSets(db as never, exerciseId)).toEqual([]);
  });

  it('NO_SESSION_TO_EXCLUDE を渡しても何も除外されない', async () => {
    const exerciseId = await insertExercise(db, { name: 'ショルダープレス' });
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId,
      sets: [{ setNumber: 1, weight: 30, reps: 12, completedAt: DONE }],
    });

    const result = await getPreviousSets(db as never, exerciseId, NO_SESSION_TO_EXCLUDE);

    expect(result.map((s) => s.weight)).toEqual([30]);
  });
});

describe('getExerciseHistoryEntries', () => {
  it('終了済みセッションのカードだけを、新しい順にセット列つきで返す', async () => {
    const exerciseId = await insertExercise(db, { name: 'ベンチプレス' });
    const older = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const newer = await insertSession(db, { startedAt: 5_000, endedAt: 6_000 });
    await insertCardWithSets(db, {
      sessionId: older,
      exerciseId,
      sets: [{ setNumber: 1, weight: 40, reps: 10, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId: newer,
      exerciseId,
      sets: [
        { setNumber: 1, weight: 50, reps: 10, completedAt: DONE },
        { setNumber: 2, weight: 55, reps: 8, completedAt: DONE },
      ],
    });

    const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);

    expect(entries.map((e) => e.sessionId)).toEqual([newer, older]);
    expect(entries[0].sets.map((s) => s.weight)).toEqual([50, 55]);
  });

  it('進行中セッション（endedAt null）のカードは含めない', async () => {
    const exerciseId = await insertExercise(db, { name: 'スクワット' });
    const ongoing = await insertSession(db, { startedAt: 5_000, endedAt: null });
    await insertCardWithSets(db, {
      sessionId: ongoing,
      exerciseId,
      sets: [{ setNumber: 1, weight: 100, reps: 5, completedAt: DONE }],
    });

    expect(await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE)).toEqual([]);
  });

  it('✓確定セットが1件も無いカードは含めない', async () => {
    const exerciseId = await insertExercise(db, { name: 'レッグプレス' });
    const drafted = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const recorded = await insertSession(db, { startedAt: 3_000, endedAt: 4_000 });
    await insertCardWithSets(db, {
      sessionId: drafted,
      exerciseId,
      sets: [{ setNumber: 1, weight: 90, reps: 10, completedAt: null }],
    });
    await insertCardWithSets(db, {
      sessionId: recorded,
      exerciseId,
      sets: [{ setNumber: 1, weight: 95, reps: 10, completedAt: DONE }],
    });

    const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);

    expect(entries.map((e) => e.sessionId)).toEqual([recorded]);
  });

  it('excludeSessionId のセッションは除外する', async () => {
    const exerciseId = await insertExercise(db, { name: 'ローイング' });
    const a = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const b = await insertSession(db, { startedAt: 3_000, endedAt: 4_000 });
    for (const sessionId of [a, b]) {
      await insertCardWithSets(db, {
        sessionId,
        exerciseId,
        sets: [{ setNumber: 1, weight: 30, reps: 10, completedAt: DONE }],
      });
    }

    const entries = await getExerciseHistoryEntries(exerciseId, b);

    expect(entries.map((e) => e.sessionId)).toEqual([a]);
  });

  it('カードが1件も無ければ空配列を返す', async () => {
    const exerciseId = await insertExercise(db, { name: '未実施の種目' });

    expect(await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE)).toEqual([]);
  });
});

describe('getPastTrainingSessions', () => {
  async function seedSession(startedAt: number, names: string[], completed = true) {
    const sessionId = await insertSession(db, { startedAt, endedAt: startedAt + 1_000 });
    for (const [i, name] of names.entries()) {
      const exerciseId = await insertExercise(db, { name: `${name}#${startedAt}` });
      await insertCardWithSets(db, {
        sessionId,
        exerciseId,
        orderIndex: i,
        sets: [{ setNumber: 1, weight: 40, reps: 10, completedAt: completed ? DONE : null }],
      });
    }
    return sessionId;
  }

  it('新しい順に返し、種目は orderIndex 順に並ぶ', async () => {
    const older = await seedSession(1_000, ['ベンチプレス', 'ダンベルフライ']);
    const newer = await seedSession(5_000, ['スクワット']);

    const page = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 10, offset: 0 });

    expect(page.sessions.map((s) => s.sessionId)).toEqual([newer, older]);
    expect(page.sessions[1].exercises.map((e) => e.name)).toEqual([
      'ベンチプレス#1000',
      'ダンベルフライ#1000',
    ]);
    expect(page.hasMore).toBe(false);
  });

  it('✓確定セットを持たないセッションはページングの母集合にも入らない', async () => {
    await seedSession(1_000, ['下書きだけの種目'], false);
    const recorded = await seedSession(5_000, ['ベンチプレス']);

    const page = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 10, offset: 0 });

    expect(page.sessions.map((s) => s.sessionId)).toEqual([recorded]);
    expect(page.hasMore).toBe(false);
  });

  it('limit を超える件数があれば hasMore=true になり、返る件数は limit で頭打ちになる', async () => {
    await seedSession(1_000, ['A']);
    await seedSession(2_000, ['B']);
    await seedSession(3_000, ['C']);

    const page = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 2, offset: 0 });

    expect(page.sessions).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('offset で次ページを取れ、最終ページでは hasMore=false になる', async () => {
    const s1 = await seedSession(1_000, ['A']);
    const s2 = await seedSession(2_000, ['B']);
    const s3 = await seedSession(3_000, ['C']);

    const first = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 2, offset: 0 });
    const second = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 2, offset: 2 });

    expect(first.sessions.map((s) => s.sessionId)).toEqual([s3, s2]);
    expect(second.sessions.map((s) => s.sessionId)).toEqual([s1]);
    expect(second.hasMore).toBe(false);
  });

  it('startedAt が同値でもページ境界で重複・欠落しない（id をタイブレークに使う）', async () => {
    const a = await seedSession(1_000, ['A']);
    const b = await seedSession(1_000, ['B']);
    const c = await seedSession(1_000, ['C']);

    const first = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 2, offset: 0 });
    const second = await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 2, offset: 2 });
    const seen = [...first.sessions, ...second.sessions].map((s) => s.sessionId);

    expect(new Set(seen).size).toBe(3);
    expect(seen.sort()).toEqual([a, b, c].sort());
  });

  it('excludeSessionId のセッションは返さない', async () => {
    const keep = await seedSession(1_000, ['A']);
    const skip = await seedSession(5_000, ['B']);

    const page = await getPastTrainingSessions(skip, { limit: 10, offset: 0 });

    expect(page.sessions.map((s) => s.sessionId)).toEqual([keep]);
  });

  it('該当セッションが無ければ sessions=[] / hasMore=false を返す', async () => {
    expect(await getPastTrainingSessions(NO_SESSION_TO_EXCLUDE, { limit: 10, offset: 0 })).toEqual({
      sessions: [],
      hasMore: false,
    });
  });
});

describe('getSessionExerciseCards', () => {
  it('orderIndex 順に、種目メタ情報とセット列つきで返す', async () => {
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const second = await insertExercise(db, {
      name: 'ダンベルフライ',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'dumbbell_fly',
    });
    const first = await insertExercise(db, { name: 'ベンチプレス', source: 'custom' });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId: second,
      orderIndex: 1,
      sets: [{ setNumber: 1, weight: 20, reps: 12, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId: first,
      orderIndex: 0,
      sets: [{ setNumber: 1, weight: 60, reps: 10, completedAt: DONE }],
    });

    const cards = await getSessionExerciseCards(sessionId);

    expect(cards.map((c) => c.name)).toEqual(['ベンチプレス', 'ダンベルフライ']);
    expect(cards[1]).toMatchObject({ source: 'preset', slug: 'dumbbell_fly', category: 'chest' });
    expect(cards[0].sets.map((s) => s.weight)).toEqual([60]);
  });

  it('既定では✓確定セットが1件も無いカードを除く', async () => {
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const confirmed = await insertExercise(db, { name: '確定あり' });
    const draft = await insertExercise(db, { name: '下書きのみ' });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId: confirmed,
      orderIndex: 0,
      sets: [{ setNumber: 1, weight: 60, reps: 10, completedAt: DONE }],
    });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId: draft,
      orderIndex: 1,
      sets: [{ setNumber: 1, weight: 20, reps: 12, completedAt: null }],
    });

    const cards = await getSessionExerciseCards(sessionId);

    expect(cards.map((c) => c.name)).toEqual(['確定あり']);
  });

  it('includeUnconfirmedCards を渡すと未確定カードもそのまま返す', async () => {
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const draft = await insertExercise(db, { name: '下書きのみ' });
    await insertCardWithSets(db, {
      sessionId,
      exerciseId: draft,
      sets: [{ setNumber: 1, weight: 20, reps: 12, completedAt: null }],
    });

    const cards = await getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true });

    expect(cards.map((c) => c.name)).toEqual(['下書きのみ']);
  });

  it('セットが1件も無いカードは、未確定を含める指定なら sets:[] で返る', async () => {
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });
    const exerciseId = await insertExercise(db, { name: '追加しただけ' });
    await insertCardWithSets(db, { sessionId, exerciseId, sets: [] });

    expect(await getSessionExerciseCards(sessionId)).toEqual([]);
    const cards = await getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true });
    expect(cards).toHaveLength(1);
    expect(cards[0].sets).toEqual([]);
  });

  it('カードが1件も無いセッションでは空配列を返す', async () => {
    const sessionId = await insertSession(db, { startedAt: 1_000, endedAt: 2_000 });

    expect(await getSessionExerciseCards(sessionId)).toEqual([]);
  });
});
