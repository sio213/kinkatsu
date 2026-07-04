import { db } from '@/db/client';
import { exercises, type Exercise } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback } from 'react';

export function useExercises() {
  // 表示順は lib/exercises/filter.ts の filterExercises に一本化しているため、ここではソートしない
  const { data } = useLiveQuery(db.select().from(exercises));

  const addExercise = useCallback(
    async (values: Pick<Exercise, 'name' | 'category' | 'note' | 'favorite'>) => {
      await db.insert(exercises).values({
        ...values,
        source: 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
    [],
  );

  const updateExercise = useCallback(
    async (id: number, values: Partial<Pick<Exercise, 'name' | 'category' | 'note' | 'favorite'>>) => {
      await db
        .update(exercises)
        .set({ ...values, updatedAt: Date.now() })
        .where(eq(exercises.id, id));
    },
    [],
  );

  const toggleFavorite = useCallback(
    async (id: number, favorite: boolean) => {
      await db
        .update(exercises)
        .set({ favorite, updatedAt: Date.now() })
        .where(eq(exercises.id, id));
    },
    [],
  );

  const removeExercise = useCallback(async (id: number) => {
    // UI（詳細画面の⋮メニュー）はcustom種目にしか削除ボタンを出さないが、直接呼ばれた場合の
    // 保険としてフック側でもプリセット種目の削除をブロックする
    const [target] = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
    if (target?.source === 'preset') {
      throw new Error('プリセット種目は削除できません');
    }
    await db.delete(exercises).where(eq(exercises.id, id));
  }, []);

  return { exercises: data ?? [], addExercise, updateExercise, toggleFavorite, removeExercise };
}

export function useExercise(id: number) {
  const { data } = useLiveQuery(
    db.select().from(exercises).where(eq(exercises.id, id)).limit(1),
  );
  return { exercise: data?.[0], loaded: data !== undefined };
}
