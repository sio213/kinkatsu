import { db } from '@/db/client';
import { exercises as exercisesSchema } from '@/db/schema';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export const useExercises = () => {
  const { data: exercises } = useLiveQuery(db.select().from(exercisesSchema));

  return { exercises: exercises ?? [] };
};
