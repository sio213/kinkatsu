import { db } from '@/db/client';
import { routines, type Routine } from '@/db/schema';
import {
  createRoutine,
  deleteRoutine,
  swapRoutineOrder,
  updateRoutine,
  type RoutineInput,
} from '@/lib/routines/db';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

export function useRoutines() {
  const { data } = useLiveQuery(db.select().from(routines).orderBy(routines.orderIndex));
  const list: Routine[] = data ?? [];

  return {
    routines: list,
    createRoutine: (input: RoutineInput) => createRoutine(input),
    updateRoutine: (id: number, input: RoutineInput) => updateRoutine(id, input),
    removeRoutine: (id: number) => deleteRoutine(id),
    swapOrder: (id: number, targetId: number) => swapRoutineOrder(id, targetId),
  };
}
