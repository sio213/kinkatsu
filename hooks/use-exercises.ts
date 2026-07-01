import { db } from '@/db/client';
import { exercises, type Exercise } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export function useExercises() {
  const { data } = useLiveQuery(
    db.select().from(exercises).orderBy(exercises.category, exercises.name),
  );

  return {
    exercises: data ?? [],
    addExercise: (name: string, category: string, note?: string) =>
      db.insert(exercises).values({
        name,
        category,
        note: note ?? null,
        source: 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    updateExercise: (
      id: number,
      values: Partial<Pick<Exercise, 'name' | 'category' | 'note'>>,
    ) =>
      db
        .update(exercises)
        .set({ ...values, updatedAt: Date.now() })
        .where(eq(exercises.id, id)),
    toggleFavorite: (id: number, favorite: boolean) =>
      db
        .update(exercises)
        .set({ favorite, updatedAt: Date.now() })
        .where(eq(exercises.id, id)),
    removeExercise: (id: number) => db.delete(exercises).where(eq(exercises.id, id)),
  };
}
