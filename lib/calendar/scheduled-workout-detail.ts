import { db, type DbOrTx, type Tx } from '@/db/client';
import { scheduledWorkoutExercises, scheduledWorkoutSets, scheduledWorkouts } from '@/db/schema';
import { buildInitialRoutineSets, getRoutineDetail, type RoutineExerciseSelection } from '@/lib/routines/db';
import { getPreviousSetsForCard } from '@/lib/workout/history';
import { hasAnyValue, type PreviousSetValues } from '@/lib/workout/set-values';
import { and, desc, eq } from 'drizzle-orm';

// 種目一覧を変える操作（追加・削除・入れ替え・並び替え）ではscheduledWorkouts.updatedAtも
// 更新する。個々のセット値編集（400msデバウンスの自動保存、addScheduledWorkoutSet等）は
// 呼び出し頻度が高く、そのたびにscheduledWorkoutIdを引き直してまでupdatedAtを更新する
// 価値は無い（現状updatedAtを読むコードも無い、@reviewer指摘）ため対象外にする
async function touchScheduledWorkout(tx: Tx, scheduledWorkoutId: number, now: number): Promise<void> {
  await tx.update(scheduledWorkouts).set({ updatedAt: now }).where(eq(scheduledWorkouts.id, scheduledWorkoutId));
}

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
    await touchScheduledWorkout(tx, scheduledWorkoutId, now);
  });
}

// ヘッダー⋮「ルーティンから読み込み」(app/calendar/schedule-workout-routine-load.tsx)用。
// lib/workout/session.tsのinsertRoutineCardsIntoSession/addRoutineExercisesToSessionと同じ方針で、
// 選んだルーティンの種目を新規追加し、目標セットは「そのルーティンの実際の値」をそのままコピーする
// （addExercisesToScheduledWorkoutが種目追加ピッカー用に「直近の実績」をプリフィルするのとは
// 異なり、こちらは画面上で確認した値と入る値を一致させるため、ユーザーが見たルーティンの値を
// そのまま使う）。ルーティンに0セットの種目が含まれる場合は空欄1セットにフォールバックする
// （lib/workout/session.tsのbuildInitialSetsと同じ挙動）
export async function addRoutineExercisesToScheduledWorkout(
  scheduledWorkoutId: number,
  routineId: number,
  selections: RoutineExerciseSelection[],
): Promise<void> {
  if (selections.length === 0) return;
  const detail = await getRoutineDetail(routineId);
  if (!detail) return;
  // detail.exercises(orderIndex順)をfilterすることで、一部だけ選択してもselectionsの並びが
  // クリック順ではなくルーティン内の表示順のまま保たれる（addRoutineExercisesToSessionと同じ考え方）
  const selectedIds = new Set(selections.map((s) => s.routineExerciseId));
  const selectedExercises = detail.exercises.filter((e) => selectedIds.has(e.id));
  if (selectedExercises.length === 0) return;

  const now = Date.now();
  const startIndex = (await getMaxOrderIndex(scheduledWorkoutId)) + 1;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(scheduledWorkoutExercises)
      .values(
        selectedExercises.map((e, i) => ({
          scheduledWorkoutId,
          exerciseId: e.exerciseId,
          orderIndex: startIndex + i,
          createdAt: now,
        })),
      )
      .returning();

    // 単一のINSERT...RETURNINGは挿入した値の順序で行を返す（lib/workout/session.tsの
    // insertSessionExerciseCardsと同じSQLite/expo-sqliteの実際の挙動への依存）ため、
    // inserted[i]とselectedExercises[i]は対応する
    await insertScheduledWorkoutSetsFromValues(
      tx,
      inserted.map((row, i) => ({ scheduledWorkoutExerciseId: row.id, values: selectedExercises[i].sets })),
      now,
    );
    await touchScheduledWorkout(tx, scheduledWorkoutId, now);
  });
}

export type HistoryCardSelection = { exerciseId: number; sourceWorkoutSessionExerciseId: number };

// ヘッダー⋮「過去の記録から読み込み」(app/calendar/schedule-workout-history-load.tsx)用。
// lib/workout/session.tsのaddHistoryCardsToSessionと同じ方針で、選んだ過去カードそのものの
// セット値をコピーする（種目単位で直近を自動特定するaddExercisesToScheduledWorkoutとは異なり、
// 画面上で確認した過去カードそのものの値を使う）。同じ種目が既にこの予定にあっても上書きはせず、
// 常に新規行として追加する（種目追加ピッカーと同じ「同じ種目を複数回追加できる」仕様を踏襲）
export async function addHistoryCardsToScheduledWorkout(
  scheduledWorkoutId: number,
  selections: HistoryCardSelection[],
): Promise<void> {
  if (selections.length === 0) return;
  const now = Date.now();
  const startIndex = (await getMaxOrderIndex(scheduledWorkoutId)) + 1;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(scheduledWorkoutExercises)
      .values(
        selections.map((s, i) => ({
          scheduledWorkoutId,
          exerciseId: s.exerciseId,
          orderIndex: startIndex + i,
          createdAt: now,
        })),
      )
      .returning();

    // カードごとに直列でawaitする（lib/workout/session.tsのinsertSessionExerciseCardsと同じ理由。
    // 同一トランザクション内での並列クエリ発行を避け、insertedとselectionsの対応順を保つ）。
    // 取得した各カードのセット値は貯めておき、ルーティン読み込み経路(addRoutineExercisesToScheduledWorkout)
    // と同じくinsertScheduledWorkoutSetsFromValuesへ最後に1回だけまとめて渡す（@reviewer指摘: 経路間で
    // 抽象の使い方を揃える）
    const rows: { scheduledWorkoutExerciseId: number; values: PreviousSetValues[] }[] = [];
    for (const [i, row] of inserted.entries()) {
      const historySets = (await getPreviousSetsForCard(tx, selections[i].sourceWorkoutSessionExerciseId)).filter(
        hasAnyValue,
      );
      rows.push({ scheduledWorkoutExerciseId: row.id, values: historySets });
    }
    await insertScheduledWorkoutSetsFromValues(tx, rows, now);
    await touchScheduledWorkout(tx, scheduledWorkoutId, now);
  });
}

// valuesのsetNumberは読まず、渡された配列順で1から振り直す（コピー元のsetNumberが
// 欠番/重複していても新しい行は必ず連番になる。lib/workout/session.tsのbuildInitialSetsと同じ方針）
async function insertScheduledWorkoutSetsFromValues(
  tx: Tx,
  rows: { scheduledWorkoutExerciseId: number; values: PreviousSetValues[] }[],
  now: number,
): Promise<void> {
  for (const row of rows) {
    const sets = row.values.length > 0
      ? row.values
      : [{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }];
    await tx.insert(scheduledWorkoutSets).values(
      sets.map((s, i) => ({
        scheduledWorkoutExerciseId: row.scheduledWorkoutExerciseId,
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
    await touchScheduledWorkout(tx, row.scheduledWorkoutId, Date.now());
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
    const [row] = await tx
      .select({ scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId));
    if (!row) return;

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
    await touchScheduledWorkout(tx, row.scheduledWorkoutId, now);
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
    await touchScheduledWorkout(tx, scheduledWorkoutId, Date.now());
  });
}

// ヘッダー⋮「並び替え」(app/calendar/schedule-workout-exercise-reorder.tsx)から一括で呼ばれる。
// lib/workout/session.tsのreorderSessionExercisesと同じ方針で、ドロップのたびに全件のorderIndexを
// 振り直す（隣接swapのmoveScheduledWorkoutExerciseとは別に、ドラッグ&ドロップの並び替え画面専用）
export async function reorderScheduledWorkoutExercises(
  scheduledWorkoutId: number,
  orderedScheduledWorkoutExerciseIds: number[],
): Promise<void> {
  if (orderedScheduledWorkoutExerciseIds.length === 0) return;
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (const [orderIndex, scheduledWorkoutExerciseId] of orderedScheduledWorkoutExerciseIds.entries()) {
      await tx
        .update(scheduledWorkoutExercises)
        .set({ orderIndex })
        .where(
          and(
            eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId),
            eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId),
          ),
        );
    }
    await touchScheduledWorkout(tx, scheduledWorkoutId, now);
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
