import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 種目
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

// 型
export type Exercise = typeof exercises.$inferSelect;
