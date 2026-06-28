import migrations from '@/drizzle/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';

export const runMigrations = async () => {
  await migrate(db, migrations);
  console.log('✅ Migration completed');
};
