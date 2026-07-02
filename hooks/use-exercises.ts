import { db } from '@/db/client';
import { exercises, type Exercise } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback } from 'react';

export function useExercises() {
  const { data } = useLiveQuery(
    db.select().from(exercises).orderBy(exercises.category, exercises.name),
  );

  const addExercise = useCallback(
    (name: string, category: string, note?: string) =>
      db.insert(exercises).values({
        name,
        category,
        note: note ?? null,
        source: 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    [],
  );

  const updateExercise = useCallback(
    (id: number, values: Partial<Pick<Exercise, 'name' | 'category' | 'note'>>) =>
      db
        .update(exercises)
        .set({ ...values, updatedAt: Date.now() })
        .where(eq(exercises.id, id)),
    [],
  );

  const toggleFavorite = useCallback(
    (id: number, favorite: boolean) =>
      db
        .update(exercises)
        .set({ favorite, updatedAt: Date.now() })
        .where(eq(exercises.id, id)),
    [],
  );

  const removeExercise = useCallback(
    (id: number) => db.delete(exercises).where(eq(exercises.id, id)),
    [],
  );

  return { exercises: data ?? [], addExercise, updateExercise, toggleFavorite, removeExercise };
}

export function useExercise(id: number) {
  const { data } = useLiveQuery(
    db.select().from(exercises).where(eq(exercises.id, id)).limit(1),
  );
  return data?.[0];
}
