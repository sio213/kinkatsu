import { db, type DbOrTx, type Tx } from '@/db/client';
import {
  exercises,
  reminders,
  routineExercises,
  routines,
  routineSets,
  type Reminder,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
} from '@/db/schema';
import { createReminder, deleteReminder, updateReminder } from '@/lib/notifications/scheduler';
import type { ReminderInput } from '@/lib/notifications/types';
import { withRoutineReminderContent } from '@/lib/routines/reminder-input';
import { getPreviousSets, hasAnyValue } from '@/lib/workout/history';
import { eq, gt, inArray, sql } from 'drizzle-orm';

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

// ルーティンフォームのリマインダーセクションの保存内容。inputがnull(未設定のまま)なら
// リマインダーの作成/更新は行わない(トグルOFF+未設定はこの状態のまま保存できる)
export type RoutineReminderPlan = {
  enabled: boolean;
  input: ReminderInput | null;
};

// ルーティンフォームの種目行（サムネイル・名前・部位タグ・代表セット）表示に必要な
// 種目メタ情報込みの1件分
export type RoutineDetailExercise = RoutineExercise & {
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: RoutineSet[];
};

export type RoutineDetail = {
  routine: Routine;
  exercises: RoutineDetailExercise[];
  // このルーティンに紐づくリマインダー(無ければnull)。1ルーティンにつき高々1件の前提
  // （リマインダーセクションの保存フローがcreate/update先を1件に決め打ちしているため）
  reminder: Reminder | null;
};

// 種目追加ピッカーで選ばれた種目をルーティンの下書きに加える際の初期セット値。
// その種目の直近の実績（実際のトレーニング記録）をプリフィルし、記録が無ければ
// 空欄1セットにフォールバックする（トレーニング中画面の新規カード追加時と同じ挙動をルーティンにも揃える）
export async function buildInitialRoutineSets(exerciseId: number): Promise<RoutineSetInput[]> {
  // lib/workout/session.tsのaddExercisesToSession等と同じくhasAnyValueで絞り込む。
  // ✓未確定のまま全カラムnullで終わったセットは「前回入力した値」として意味が無く、
  // そのままコピーするとテンプレートに余分な空セットが混入してしまうため
  const previous = (await getPreviousSets(db, exerciseId)).filter(hasAnyValue);
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

// routineExercises.idごとのroutineSetsをsetNumber順に引けるMapにする。getRoutineDetail(表示用)と
// duplicateRoutine(コピー用)の両方で「種目に紐づくセットをまとめて取得しグルーピングする」処理が
// 共通のため切り出す
async function fetchSetsByExercise(dbOrTx: DbOrTx, exerciseIds: number[]): Promise<Map<number, RoutineSet[]>> {
  const setRows = exerciseIds.length
    ? await dbOrTx
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
  return setsByExercise;
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

// ルーティン保存(作成/更新)後にリマインダーのcreate/update/掃除を行う。既存の紐づくリマインダー
// (高々1件の前提)を見て、reminderPlan.inputがあればそれで作成/更新、無ければ
// (通常は起きないが、既存分が残っていた場合の防御的な掃除として)削除する。
// ルーティン本体(routines/routineExercises/routineSets)のトランザクションが確定した後に
// 呼ぶため、ここで失敗してもルーティン自体の保存は既に成功している。ここでthrowすると
// createRoutine/updateRoutine全体が失敗扱いになり、ユーザーが保存をリトライして
// ルーティンが重複作成される恐れがあるため、失敗はログのみに留めて再throwしない
// (通知のスケジューリング失敗はOS側の一時的な問題であることが多く、次回このルーティンを
// 開いて保存し直せば再試行される)
async function applyRoutineReminderPlan(routineId: number, routineName: string, plan: RoutineReminderPlan): Promise<void> {
  try {
    const [existing] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.routineId, routineId));

    if (!plan.input) {
      if (existing) await deleteReminder(existing.id);
      return;
    }

    const content = withRoutineReminderContent({ ...plan.input, enabled: plan.enabled }, routineId, routineName);
    if (existing) {
      await updateReminder(existing.id, content);
    } else {
      await createReminder(content);
    }
  } catch (e) {
    console.error('[routine reminder plan]', e);
  }
}

export async function createRoutine(input: RoutineInput, reminderPlan?: RoutineReminderPlan): Promise<number> {
  const now = Date.now();
  const routineId = await db.transaction(async (tx) => {
    const existing = await tx.select({ orderIndex: routines.orderIndex }).from(routines);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map((r) => r.orderIndex)) + 1 : 0;
    const [inserted] = await tx
      .insert(routines)
      .values({ name: input.name, orderIndex, createdAt: now, updatedAt: now })
      .returning();
    await insertRoutineExercises(tx, inserted.id, input.exercises, now);
    return inserted.id;
  });

  if (reminderPlan) await applyRoutineReminderPlan(routineId, input.name, reminderPlan);

  return routineId;
}

// 種目・セットは編集のたびに全置換する（フォームが下書き全体を保持しており差分更新の必要が無いため）。
// そのためroutineExercises/routineSetsのidは保存のたびに新規採番される使い捨てで、
// reminders.routineId以外にこれらのidを外部参照するものは無い前提。将来これらのidを
// 安定参照したくなった場合（種目単位のメモ・セット単位の履歴リンク等）はこの方式が破綻するため設計し直しが必要
export async function updateRoutine(routineId: number, input: RoutineInput, reminderPlan?: RoutineReminderPlan): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.update(routines).set({ name: input.name, updatedAt: now }).where(eq(routines.id, routineId));
    await tx.delete(routineExercises).where(eq(routineExercises.routineId, routineId));
    await insertRoutineExercises(tx, routineId, input.exercises, now);
  });

  if (reminderPlan) await applyRoutineReminderPlan(routineId, input.name, reminderPlan);
}

// 一覧の「⋮」メニューの「複製」。種目・セット構成を丸ごとコピーし、元カードの直下に挿入する。
// リマインダーは複製しない（同じ曜日に重複登録されると気づかず放置されがちなため、複製先は
// 通知未設定の別ルーティンとして始める）
export async function duplicateRoutine(routineId: number): Promise<number> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(routines).where(eq(routines.id, routineId));
    if (!source) throw new Error(`routine not found: ${routineId}`);

    const exerciseRows = await tx
      .select()
      .from(routineExercises)
      .where(eq(routineExercises.routineId, routineId))
      .orderBy(routineExercises.orderIndex);

    const exerciseIds = exerciseRows.map((e) => e.id);
    const setsByExercise = await fetchSetsByExercise(tx, exerciseIds);

    const exercisesInput: RoutineExerciseInput[] = exerciseRows.map((e) => ({
      exerciseId: e.exerciseId,
      sets: (setsByExercise.get(e.id) ?? []).map((s) => ({
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
      })),
    }));

    // 元カードの直下に割り込ませるため、後続カードのorderIndexを一括で+1シフトしてから挿入する。
    // 挿入より先に行う必要がある（挿入を先にすると、新規行のorderIndexもこのUPDATEのWHERE条件に
    // 引っかかり二重にシフトされてしまう）
    await tx
      .update(routines)
      .set({ orderIndex: sql`${routines.orderIndex} + 1` })
      .where(gt(routines.orderIndex, source.orderIndex));

    const [inserted] = await tx
      .insert(routines)
      .values({ name: `${source.name} コピー`, orderIndex: source.orderIndex + 1, createdAt: now, updatedAt: now })
      .returning();
    await insertRoutineExercises(tx, inserted.id, exercisesInput, now);
    return inserted.id;
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
    .select({
      id: routineExercises.id,
      routineId: routineExercises.routineId,
      exerciseId: routineExercises.exerciseId,
      orderIndex: routineExercises.orderIndex,
      createdAt: routineExercises.createdAt,
      name: exercises.name,
      category: exercises.category,
      measurementType: exercises.measurementType,
      source: exercises.source,
      slug: exercises.slug,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(routineExercises.orderIndex);

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await fetchSetsByExercise(db, exerciseIds);

  const [reminder] = await db.select().from(reminders).where(eq(reminders.routineId, routineId));

  return {
    routine,
    exercises: exerciseRows.map((e) => ({ ...e, sets: setsByExercise.get(e.id) ?? [] })),
    reminder: reminder ?? null,
  };
}
