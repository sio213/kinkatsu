// 実SQLite（better-sqlite3）の上に本物のdrizzleインスタンスを立てるヘルパー。
//
// これまでの `*-integration.test.ts` は、db/client.ts が expo-sqlite 依存で jest では
// 動かせないため「プロダクションのクエリと同じSQLを手で書き写して実行する」方式だった。
// その方式には「lib側のクエリを変えてもテストが自動追従しない」という既知の弱点があり、
// 実際にファイル冒頭のコメントで注意書きされている（__tests__/workout/history-integration.test.ts）。
//
// drizzleのbetter-sqlite3ドライバは expo-sqlite ドライバと同じ db/schema.ts から同じ
// SQLiteのSQLを組み立てるので、`@/db/client` の db をこれに差し替えれば
// lib/workout/history.ts のような「DBを引数に取る関数」を本物のまま実行できる。
// SQLの写し間違い・写し忘れが起き得ないぶん、こちらの方が壊れにくい。
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import * as schema from '@/db/schema';

const DRIZZLE_DIR = path.join(__dirname, '../../drizzle');

export type TestDb = ReturnType<typeof createTestDb>['db'];

function applyAllMigrations(sqlite: Database.Database): void {
  const files = fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, file), 'utf-8');
    sqlite.exec(sql.replace(/--> statement-breakpoint/g, ''));
  }
}

/**
 * マイグレーション適用済みのインメモリDBと、その上のdrizzleインスタンスを返す。
 * 本番のdb/client.tsと同じく外部キー制約を有効にする（SQLiteは既定で無効）。
 */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyAllMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

// 依存の逆順（子→親）に消す。外部キーを有効にしているため親から消すと restrict に当たる
const TABLES_CHILD_FIRST = [
  'sets',
  'workout_session_exercises',
  'workout_sessions',
  'routine_sets',
  'routine_exercises',
  'reminder_notifications',
  'reminder_schedule_skips',
  'reminders',
  'routines',
  'scheduled_workout_sets',
  'scheduled_workout_exercises',
  'scheduled_workouts',
  'exercises',
];

/** テスト間で状態が漏れないよう全テーブルを空にする。存在しないテーブルは黙って飛ばす */
export function resetTestDb(sqlite: Database.Database): void {
  const existing = new Set(
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => (r as { name: string }).name),
  );
  for (const table of TABLES_CHILD_FIRST) {
    if (existing.has(table)) sqlite.exec(`DELETE FROM ${table}`);
  }
}

let nextStartedAt = 1_700_000_000_000;

/** startedAtを明示しないセッションが互いに同じ時刻にならないよう単調増加させる */
function takeStartedAt(): number {
  nextStartedAt += 60_000;
  return nextStartedAt;
}

type ExerciseSeed = {
  name: string;
  category?: string;
  measurementType?: string;
  source?: 'preset' | 'custom';
  slug?: string;
  pairedWeights?: boolean;
};

export async function insertExercise(db: TestDb, seed: ExerciseSeed): Promise<number> {
  const now = Date.now();
  const [row] = await db
    .insert(schema.exercises)
    .values({
      name: seed.name,
      category: seed.category ?? 'chest',
      measurementType: seed.measurementType ?? 'weight_reps',
      source: seed.source ?? 'custom',
      slug: seed.slug,
      pairedWeights: seed.pairedWeights ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.exercises.id });
  return row.id;
}

export async function insertSession(
  db: TestDb,
  opts: { startedAt?: number; endedAt?: number | null; note?: string | null } = {},
): Promise<number> {
  const startedAt = opts.startedAt ?? takeStartedAt();
  const [row] = await db
    .insert(schema.workoutSessions)
    .values({
      startedAt,
      endedAt: opts.endedAt ?? null,
      note: opts.note ?? null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    .returning({ id: schema.workoutSessions.id });
  return row.id;
}

export async function insertCard(
  db: TestDb,
  opts: { sessionId: number; exerciseId: number; orderIndex?: number },
): Promise<number> {
  const [row] = await db
    .insert(schema.workoutSessionExercises)
    .values({
      sessionId: opts.sessionId,
      exerciseId: opts.exerciseId,
      orderIndex: opts.orderIndex ?? 0,
      createdAt: Date.now(),
    })
    .returning({ id: schema.workoutSessionExercises.id });
  return row.id;
}

type SetSeed = {
  cardId: number;
  exerciseId: number;
  sessionId: number;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  completedAt?: number | null;
};

export async function insertSet(db: TestDb, seed: SetSeed): Promise<number> {
  const now = Date.now();
  const [row] = await db
    .insert(schema.sets)
    .values({
      workoutSessionExerciseId: seed.cardId,
      exerciseId: seed.exerciseId,
      sessionId: seed.sessionId,
      setNumber: seed.setNumber,
      weight: seed.weight ?? null,
      reps: seed.reps ?? null,
      durationSeconds: seed.durationSeconds ?? null,
      distanceMeters: seed.distanceMeters ?? null,
      completedAt: seed.completedAt ?? null,
      createdAt: now,
    })
    .returning({ id: schema.sets.id });
  return row.id;
}

/** カード1枚と、そこにぶら下がるセット列をまとめて作る */
export async function insertCardWithSets(
  db: TestDb,
  opts: {
    sessionId: number;
    exerciseId: number;
    orderIndex?: number;
    sets: Omit<SetSeed, 'cardId' | 'exerciseId' | 'sessionId'>[];
  },
): Promise<number> {
  const cardId = await insertCard(db, opts);
  for (const set of opts.sets) {
    await insertSet(db, {
      ...set,
      cardId,
      exerciseId: opts.exerciseId,
      sessionId: opts.sessionId,
    });
  }
  return cardId;
}
