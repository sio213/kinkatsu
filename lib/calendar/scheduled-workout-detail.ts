import { db, type DbOrTx, type Tx } from '@/db/client';
import { scheduledWorkoutExercises, scheduledWorkoutSets } from '@/db/schema';
import { buildInitialRoutineSets } from '@/lib/routines/db';
import { hasAnyValue, type PreviousSetValues } from '@/lib/workout/set-values';
import { desc, eq } from 'drizzle-orm';

// カレンダーの「直接追加」予定の種目一覧をまとめて編集する画面（app/calendar/schedule-workout-edit.tsx、
// 2026-07-20）用。ルーティンの下書きストア(useRoutineDraftStore)と違い、この予定は既にDBに永続化
// 済みの実体なので、編集操作はすべて即座にDBへ書き込む（保存ボタンは持たない、画面はapp/workout/[id].tsx
// の過去記録編集モードと同じ「戻るだけ」の体験）

async function getMaxOrderIndex(scheduledWorkoutId: number): Promise<number> {
  const rows = await db
    .select({ orderIndex: scheduledWorkoutExercises.orderIndex })
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId));
  return rows.length > 0 ? Math.max(...rows.map((r) => r.orderIndex)) : -1;
}

// 新規追加されたscheduledWorkoutExercises行に、その種目の直近の実績があれば目標セットとして
// プリフィルする（無ければ空欄1セット）。lib/calendar/scheduled-workouts.tsのaddDirectScheduledWorkout
// （予定の新規作成）とaddExercisesToScheduledWorkout（既存予定への追加）で共通のため切り出す
export async function insertInitialScheduledWorkoutSets(
  tx: Tx,
  rows: { id: number; exerciseId: number }[],
  now: number,
): Promise<void> {
  for (const row of rows) {
    const initialSets = await buildInitialRoutineSets(row.exerciseId);
    await tx.insert(scheduledWorkoutSets).values(
      initialSets.map((s, i) => ({
        scheduledWorkoutExerciseId: row.id,
        setNumber: i + 1,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        createdAt: now,
      })),
    );
  }
}

// 種目追加ピッカーで選ばれた種目をこの予定に追加する。ルーティンの種目追加(buildInitialRoutineSets)
// と同じく、その種目の直近の実績があれば目標セットとしてプリフィルし、無ければ空欄1セットにする
export async function addExercisesToScheduledWorkout(scheduledWorkoutId: number, exerciseIds: number[]): Promise<void> {
  if (exerciseIds.length === 0) return;
  const now = Date.now();
  const startIndex = (await getMaxOrderIndex(scheduledWorkoutId)) + 1;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(scheduledWorkoutExercises)
      .values(
        exerciseIds.map((exerciseId, i) => ({
          scheduledWorkoutId,
          exerciseId,
          orderIndex: startIndex + i,
          createdAt: now,
        })),
      )
      .returning();
    await insertInitialScheduledWorkoutSets(tx, inserted, now);
  });
}

// 種目カード⋮メニュー「削除」。この予定に最低1種目は残す必要があるため（addDirectScheduledWorkout
// が0種目の予定を作れないのと同じ制約）、最後の1件は削除できないよう安全網を張る。
// scheduledWorkoutSetsはonDelete cascadeのため、この1行を消すだけで目標セットも連動して消える
export async function removeScheduledWorkoutExercise(scheduledWorkoutExerciseId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId));
    if (!row) return;

    const siblings = await tx
      .select({ id: scheduledWorkoutExercises.id })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, row.scheduledWorkoutId));
    if (siblings.length <= 1) throw new Error('cannot remove the last exercise from a scheduled workout');

    await tx.delete(scheduledWorkoutExercises).where(eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId));
  });
}

// 種目カード⋮メニュー「入れ替え」。既存の目標セットは全て削除し、入れ替え先の種目の直近の実績が
// あればそれをプリフィル、無ければ空欄1セットにする（app/routine/exercise-swap.tsxのbuildInitialRoutineSets
// 利用と同じ方針。lib/workout/session.tsのreplaceSessionExerciseは前回記録のみを見るが、
// こちらは目標セット編集という文脈のためルーティン側の挙動に揃える）
export async function replaceScheduledWorkoutExercise(scheduledWorkoutExerciseId: number, newExerciseId: number): Promise<void> {
  const now = Date.now();
  const newSets = await buildInitialRoutineSets(newExerciseId);
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledWorkoutExercises)
      .set({ exerciseId: newExerciseId })
      .where(eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId));
    await tx.delete(scheduledWorkoutSets).where(eq(scheduledWorkoutSets.scheduledWorkoutExerciseId, scheduledWorkoutExerciseId));
    await tx.insert(scheduledWorkoutSets).values(
      newSets.map((s, i) => ({
        scheduledWorkoutExerciseId,
        setNumber: i + 1,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        createdAt: now,
      })),
    );
  });
}

// 種目カード⋮メニュー「上へ移動」「下へ移動」。orderIndexを隣接する種目と入れ替える
// （lib/routines/db.tsのswapRoutineOrderと同じ考え方）
export async function moveScheduledWorkoutExercise(
  scheduledWorkoutId: number,
  scheduledWorkoutExerciseId: number,
  direction: 'up' | 'down',
): Promise<void> {
  const rows = await db
    .select({ id: scheduledWorkoutExercises.id, orderIndex: scheduledWorkoutExercises.orderIndex })
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .orderBy(scheduledWorkoutExercises.orderIndex);
  const currentIndex = rows.findIndex((r) => r.id === scheduledWorkoutExerciseId);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= rows.length) return;

  const current = rows[currentIndex];
  const target = rows[targetIndex];
  await db.transaction(async (tx) => {
    await tx.update(scheduledWorkoutExercises).set({ orderIndex: target.orderIndex }).where(eq(scheduledWorkoutExercises.id, current.id));
    await tx.update(scheduledWorkoutExercises).set({ orderIndex: current.orderIndex }).where(eq(scheduledWorkoutExercises.id, target.id));
  });
}

// 種目カードの「セット追加」。setNumberは既存件数の続きから振り、直前セットの値をコピーする
// （lib/workout/sets.tsのaddSetと同じ方針。completedAtが無い点だけが異なる）
export async function addScheduledWorkoutSet(scheduledWorkoutExerciseId: number): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({
        setNumber: scheduledWorkoutSets.setNumber,
        weight: scheduledWorkoutSets.weight,
        reps: scheduledWorkoutSets.reps,
        durationSeconds: scheduledWorkoutSets.durationSeconds,
        distanceMeters: scheduledWorkoutSets.distanceMeters,
      })
      .from(scheduledWorkoutSets)
      .where(eq(scheduledWorkoutSets.scheduledWorkoutExerciseId, scheduledWorkoutExerciseId))
      .orderBy(desc(scheduledWorkoutSets.setNumber))
      .limit(1);
    const nextNumber = (last?.setNumber ?? 0) + 1;
    await tx.insert(scheduledWorkoutSets).values({
      scheduledWorkoutExerciseId,
      setNumber: nextNumber,
      weight: last?.weight ?? null,
      reps: last?.reps ?? null,
      durationSeconds: last?.durationSeconds ?? null,
      distanceMeters: last?.distanceMeters ?? null,
      createdAt: now,
    });
  });
}

// セット行ごとの✕削除（routine-template-set-row.tsxと同じく、末尾に限らず任意の行を削除できる。
// トレーニング中画面のセットは末尾しか消せないのと異なり、こちらは計画値の編集のため
// 任意の行を消したいユースケードがある）
export async function deleteScheduledWorkoutSet(setId: number): Promise<void> {
  await db.delete(scheduledWorkoutSets).where(eq(scheduledWorkoutSets.id, setId));
}

// 種目カードの「セット削除」クイックアクション。setNumberが最も大きい（最後に追加された）
// セットを1件削除する（lib/workout/sets.tsのdeleteLastSetと同じ方針）
export async function deleteLastScheduledWorkoutSet(scheduledWorkoutExerciseId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ id: scheduledWorkoutSets.id })
      .from(scheduledWorkoutSets)
      .where(eq(scheduledWorkoutSets.scheduledWorkoutExerciseId, scheduledWorkoutExerciseId))
      .orderBy(desc(scheduledWorkoutSets.setNumber))
      .limit(1);
    if (!last) return;
    await tx.delete(scheduledWorkoutSets).where(eq(scheduledWorkoutSets.id, last.id));
  });
}

export type ScheduledWorkoutSetValues = {
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// セット行の値編集。✓確定の概念が無いため、トレーニング中画面のsaveDraft/saveSetのような
// completedAtの出し分けは不要で、常にこの1つの更新関数だけで足りる
export async function updateScheduledWorkoutSetValues(setId: number, values: ScheduledWorkoutSetValues): Promise<void> {
  await db.update(scheduledWorkoutSets).set(values).where(eq(scheduledWorkoutSets.id, setId));
}

// startWorkoutFromScheduledWorkout（lib/workout/session.ts）用。指定したscheduledWorkoutExerciseId
// の目標セットを取得する。値が1つも無い行（追加しただけで未入力）は除外し、無ければ空配列を返す
// （呼び出し側はこの場合、種目ごとの前回記録にフォールバックする）。PreviousSetValuesと同じ形で
// 返すことで、呼び出し側がgetPreviousSetsの結果とそのまま同じ経路（buildInitialSets）へ渡せる
export async function getScheduledWorkoutSetsForExercise(
  tx: DbOrTx,
  scheduledWorkoutExerciseId: number,
): Promise<PreviousSetValues[]> {
  const rows = await tx
    .select({
      setNumber: scheduledWorkoutSets.setNumber,
      weight: scheduledWorkoutSets.weight,
      reps: scheduledWorkoutSets.reps,
      durationSeconds: scheduledWorkoutSets.durationSeconds,
      distanceMeters: scheduledWorkoutSets.distanceMeters,
    })
    .from(scheduledWorkoutSets)
    .where(eq(scheduledWorkoutSets.scheduledWorkoutExerciseId, scheduledWorkoutExerciseId))
    .orderBy(scheduledWorkoutSets.setNumber);
  return rows.filter(hasAnyValue);
}
