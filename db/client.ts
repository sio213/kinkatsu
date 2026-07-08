import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const expoDb = openDatabaseSync('kinkatsu', {
  enableChangeListener: true,
});

// SQLiteは既定で外部キー制約が無効なため、sets/workoutSessionExercisesのrestrict/cascadeを
// 実際に効かせるには接続ごとに明示的に有効化する必要がある
expoDb.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expoDb, { schema });

// lib/workout/history.ts・lib/workout/session.tsのトランザクションコールバック引数の型。
// 両ファイルでそれぞれ定義すると重複するためここに集約する
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
