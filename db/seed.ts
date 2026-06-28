import { db } from './client';
import { exercises } from './schema';

// 種目
const EXERCISES = [
  {
    name: 'テストエクササイズ1',
  },
  {
    name: 'テストエクササイズ2',
  },
];

// 初期データ投入
export const seed = async () => {
  console.log('🌱 Seeding start...');

  const existing = await db.select().from(exercises).limit(1);
  if (existing.length > 0) {
    console.log('⏭️  Seeding Skipped');
    return;
  }

  const insertedExercises = await db
    .insert(exercises)
    .values(EXERCISES)
    .returning();

  console.log(`✅ exercises: ${insertedExercises.length} rows`);
};
