import { db, type Tx } from '@/db/client';
import {
  reminders,
  routineExercises,
  routines,
  routineSets,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
} from '@/db/schema';
import { deleteReminder } from '@/lib/notifications/scheduler';
import { getPreviousSets } from '@/lib/workout/history';
import { eq, inArray } from 'drizzle-orm';

export type RoutineSetInput = {
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type RoutineExerciseInput = {
  exerciseId: number;
  sets: RoutineSetInput[];
};

export type RoutineInput = {
  name: string;
  exercises: RoutineExerciseInput[];
};

export type RoutineDetail = {
  routine: Routine;
  exercises: (RoutineExercise & { sets: RoutineSet[] })[];
};

// 種目追加ピッカーで選ばれた種目をルーティンの下書きに加える際の初期セット値。
// その種目の直近の実績（実際のトレーニング記録）をプリフィルし、記録が無ければ
// 空欄1セットにフォールバックする（トレーニング中画面の新規カード追加時と同じ挙動をルーティンにも揃える）
export async function buildInitialRoutineSets(exerciseId: number): Promise<RoutineSetInput[]> {
  const previous = await getPreviousSets(db, exerciseId);
  if (previous.length === 0) {
    return [{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }];
  }
  return previous.map((s) => ({
    weight: s.weight,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
  }));
}

async function insertRoutineExercises(
  tx: Tx,
  routineId: number,
  input: RoutineExerciseInput[],
  now: number,
): Promise<void> {
  for (let i = 0; i < input.length; i++) {
    const [inserted] = await tx
      .insert(routineExercises)
      .values({ routineId, exerciseId: input[i].exerciseId, orderIndex: i, createdAt: now })
      .returning();
    if (input[i].sets.length === 0) continue;
    await tx.insert(routineSets).values(
      input[i].sets.map((s, setIdx) => ({
        routineExerciseId: inserted.id,
        setNumber: setIdx + 1,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        createdAt: now,
      })),
    );
  }
}

export async function createRoutine(input: RoutineInput): Promise<number> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const existing = await tx.select({ orderIndex: routines.orderIndex }).from(routines);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map((r) => r.orderIndex)) + 1 : 0;
    const [inserted] = await tx
      .insert(routines)
      .values({ name: input.name, orderIndex, createdAt: now, updatedAt: now })
      .returning();
    await insertRoutineExercises(tx, inserted.id, input.exercises, now);
    return inserted.id;
  });
}

// 種目・セットは編集のたびに全置換する（フォームが下書き全体を保持しており差分更新の必要が無いため）
export async function updateRoutine(routineId: number, input: RoutineInput): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.update(routines).set({ name: input.name, updatedAt: now }).where(eq(routines.id, routineId));
    await tx.delete(routineExercises).where(eq(routineExercises.routineId, routineId));
    await insertRoutineExercises(tx, routineId, input.exercises, now);
  });
}

// ルーティンに紐づくリマインダーがあれば、OS通知のキャンセルまで行うdeleteReminder()を先に
// 経由してから消す。reminders.routineIdのON DELETE SET NULLはあくまで安全網であり、
// それに任せて生カスケードで行だけ消すとOS通知が残留してしまうため
export async function deleteRoutine(routineId: number): Promise<void> {
  const linked = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(eq(reminders.routineId, routineId));
  for (const r of linked) {
    await deleteReminder(r.id);
  }
  await db.delete(routines).where(eq(routines.id, routineId));
}

// 一覧の「⋮」メニューの「上へ移動」「下へ移動」。orderIndexにユニーク制約は無いため、
// 隣接する2行のorderIndexを単純に入れ替えるだけで並び順を反映できる（session.tsのswapExerciseOrderと同じ方針）
export async function swapRoutineOrder(routineId: number, targetRoutineId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({ orderIndex: routines.orderIndex })
      .from(routines)
      .where(eq(routines.id, routineId));
    const [b] = await tx
      .select({ orderIndex: routines.orderIndex })
      .from(routines)
      .where(eq(routines.id, targetRoutineId));
    if (!a || !b) return;
    await tx.update(routines).set({ orderIndex: b.orderIndex }).where(eq(routines.id, routineId));
    await tx.update(routines).set({ orderIndex: a.orderIndex }).where(eq(routines.id, targetRoutineId));
  });
}

// ルーティン作成/編集フォームの初期値読み込み用。種目・セットをorderIndex/setNumber順に添えて返す
export async function getRoutineDetail(routineId: number): Promise<RoutineDetail | null> {
  const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
  if (!routine) return null;

  const exerciseRows = await db
    .select()
    .from(routineExercises)
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(routineExercises.orderIndex);

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setRows = exerciseIds.length
    ? await db
        .select()
        .from(routineSets)
        .where(inArray(routineSets.routineExerciseId, exerciseIds))
        .orderBy(routineSets.setNumber)
    : [];

  const setsByExercise = new Map<number, RoutineSet[]>();
  for (const s of setRows) {
    const list = setsByExercise.get(s.routineExerciseId);
    if (list) list.push(s);
    else setsByExercise.set(s.routineExerciseId, [s]);
  }

  return {
    routine,
    exercises: exerciseRows.map((e) => ({ ...e, sets: setsByExercise.get(e.id) ?? [] })),
  };
}
