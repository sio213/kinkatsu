import { db, type Tx } from '@/db/client';
import { scheduledWorkoutExercises, sets, workoutSessionExercises, workoutSessions, type WorkoutSession } from '@/db/schema';
import { getScheduledWorkoutSetsForExercise } from '@/lib/calendar/scheduled-workout-detail';
import { getRoutineDetail, type RoutineDetailExercise, type RoutineExerciseSelection } from '@/lib/routines/db';
import { getPreviousSets, getPreviousSetsForCard, hasAnyValue, type PreviousSetValues } from '@/lib/workout/history';
import { and, desc, eq, isNull } from 'drizzle-orm';

// 種目カードが新規追加/入れ替えされたことを呼び出し側（画面）に伝える情報。
// kindは新規追加(常にリスト末尾に増える)か種目入れ替え(既存カードの位置のまま)かを表し、
// 新規追加時だけ最初の入力欄にオートフォーカスする、といった出し分けに使う。
// prefilledSetIdsは、前回の記録から実際に値をコピーして挿入したセットのidの一覧
// （前回の記録が無く空の1件だけを作った場合は空配列）。ゴースト表示（値はあるが✓未確定の行の
// 見た目）は、このidに含まれる行だけに適用する。「セット追加」ボタンで後から足された行など、
// プリフィルと無関係な行まで対象にしないための精度担保
export type PrefilledCard = {
  sessionId: number;
  exerciseId: number;
  sessionExerciseId: number;
  kind: 'new' | 'swap' | 'history';
  prefilledSetIds: number[];
};

// 種目カードに最初から入っている、値が空の1セット目。前回の記録が見つからない種目の
// フォールバックとして使う
function freshSetValues(sessionId: number, exerciseId: number, workoutSessionExerciseId: number, now: number) {
  return {
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    setNumber: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: null,
    createdAt: now,
  };
}

// 実際に挿入したセットのうち、コピー元(sourceSets)に値があった行のidだけを残す。
// addExercisesToSession/replaceSessionExercise/loadHistoryIntoSessionExerciseの3箇所で
// 同じ絞り込みが必要なため共通化する。sourceSetsは呼び出し側で既にhasAnyValueで
// 絞り込み済みの前提だが、念のためここでも同じ判定をかけておく（二重チェックで安全側に倒す）
function computePrefilledSetIds(insertedIds: number[], sourceSets: PreviousSetValues[]): number[] {
  if (sourceSets.length === 0) return [];
  return insertedIds.filter((_, idx) => hasAnyValue(sourceSets[idx]));
}

// 前回のセット列をコピーして初期セットを作る。前回の記録が無ければfreshSetValuesにフォールバックする。
// completedAtは常にnull（✓は自動タップしない。ユーザーが確認して初めて確定させる）
function buildInitialSets(
  sessionId: number,
  exerciseId: number,
  workoutSessionExerciseId: number,
  now: number,
  previousSets: PreviousSetValues[],
) {
  if (previousSets.length === 0) {
    return [freshSetValues(sessionId, exerciseId, workoutSessionExerciseId, now)];
  }
  // setNumberはコピー元の値をそのまま使わず1から振り直す。コピー元の並び（setNumber昇順）は
  // previousSetsのソート順として活かしつつ、新しいカードの番号はここで完結させることで、
  // コピー元のsetNumberが何らかの理由で1から始まっていない場合でも新カードは必ず1,2,3...になる
  return previousSets.map((s, index) => ({
    sessionId,
    exerciseId,
    workoutSessionExerciseId,
    setNumber: index + 1,
    weight: s.weight,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
    completedAt: null,
    createdAt: now,
  }));
}

// createdAt/updatedAtは既定でDate.now()を呼ぶが、startWorkoutSessionは自分が既に取得した
// startedAtと必ず同じ値にしたいため、nowを明示的に渡せるようにしている（渡さない
// createPastWorkoutSessionは、過去日付のstartedAtとは別の「実際に今記録した時刻」として
// createdAt/updatedAtを持ちたいため、これは意図通り）
async function insertWorkoutSessionRow(startedAt: number, endedAt: number | null, now: number = Date.now()): Promise<WorkoutSession> {
  const [inserted] = await db
    .insert(workoutSessions)
    .values({ startedAt, endedAt, createdAt: now, updatedAt: now })
    .returning();
  return inserted;
}

export async function startWorkoutSession() {
  // startedAt/createdAt/updatedAtを同じDate.now()呼び出しから作る。別々に2回呼ぶと、
  // テスト全体を回すような負荷がかかったタイミングでミリ秒がずれ、createdAt!==startedAtに
  // なる実在のflakiness原因だった（フルテストスイート実行時のみ再現した）
  const now = Date.now();
  return insertWorkoutSessionRow(now, null, now);
}

// カレンダーの過去日パネル「記録を追加」用（2026-07-20）。作成直後からendedAtが入っているため、
// app/workout/[id].tsxは自動的に「記録の編集」モード（タイマー非表示、リアルタイム記録画面と
// 同じUIで種目追加・セット入力が可能）で開く。startedAt=endedAtにする副作用で所要時間表示は
// 「0分」になるが、事後記録に所要時間の概念自体が無いため許容する（設計フェーズで確認済み）
export async function createPastWorkoutSession(pastDate: number): Promise<WorkoutSession> {
  return insertWorkoutSessionRow(pastDate, pastDate);
}

export async function endWorkoutSession(id: number) {
  const now = Date.now();
  await db
    .update(workoutSessions)
    .set({ endedAt: now, updatedAt: now })
    .where(eq(workoutSessions.id, id));
}

// 進行中(endedAtがnull)のセッションを1件返す。endedAtがnullの行は高々1件のはずだが、
// 念のためstartedAt降順にして万一複数あっても最新の1件を返す。useWorkoutSessions()の
// activeSessionと同じ判定だが、通知タップハンドラ等Reactフックを使えない場所からも
// 呼べるようDB直読みの関数として用意する
export async function getActiveSession(): Promise<WorkoutSession | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(isNull(workoutSessions.endedAt))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  return session ?? null;
}

type ExerciseCardSpec = { exerciseId: number };

// addExercisesToSession（種目単位で直近の記録を自動プリフィル）とaddHistoryCardsToSession
// （ユーザーが選んだ特定の過去カードをそのままコピー）は、orderIndexの連番採番からカード・セットの
// 挿入、prefilledSetIdsの算出までの流れが共通のため、プリフィル元の解決方法だけを引数化して集約する。
// 既存件数の取得と採番をトランザクションでまとめ、同時呼び出しでのorderIndex重複を防ぐ
async function insertSessionExerciseCards<T extends ExerciseCardSpec>(
  tx: Tx,
  sessionId: number,
  specs: T[],
  now: number,
  kind: PrefilledCard['kind'],
  resolvePreviousSets: (tx: Tx, spec: T) => Promise<PreviousSetValues[]>,
): Promise<PrefilledCard[]> {
  if (specs.length === 0) return [];
  const existing = await tx
    .select({ orderIndex: workoutSessionExercises.orderIndex })
    .from(workoutSessionExercises)
    .where(eq(workoutSessionExercises.sessionId, sessionId));
  const startIndex =
    existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 0;
  const inserted = await tx
    .insert(workoutSessionExercises)
    .values(
      specs.map((s, i) => ({
        sessionId,
        exerciseId: s.exerciseId,
        orderIndex: startIndex + i,
        createdAt: now,
      })),
    )
    .returning();

  // 同一トランザクション内でクエリを並列発行すると競合しうるため、カードごとに直列でawaitする
  // （並列化してもメリットが薄い一方、順序が保証されなくなるデメリットの方が大きい）。
  // inserted[i]とspecs[i]の対応は「単一のINSERT...RETURNINGは挿入した値の順序で行を返す」という
  // SQLite/expo-sqliteの実際の挙動に依存している（addHistoryCardsToSessionはこの対応が
  // ズレると別カードのセット値を取り違えるため、addExercisesToSessionより影響が大きい）
  const result: PrefilledCard[] = [];
  const initialSetsByCard: ReturnType<typeof buildInitialSets>[] = [];
  const previousSetsByCard: PreviousSetValues[][] = [];
  for (let i = 0; i < inserted.length; i++) {
    const wse = inserted[i];
    // 値が1つも無い行（前回「セット追加」だけ押されて未入力のまま終わった等）は
    // コピー対象から除外する（除外しないと新しいカードに余分な空行が増えてしまう）
    const previousSets = (await resolvePreviousSets(tx, specs[i])).filter(hasAnyValue);
    previousSetsByCard.push(previousSets);
    result.push({
      sessionId,
      exerciseId: wse.exerciseId,
      sessionExerciseId: wse.id,
      kind,
      prefilledSetIds: [],
    });
    initialSetsByCard.push(buildInitialSets(sessionId, wse.exerciseId, wse.id, now, previousSets));
  }
  const insertedSets = await tx.insert(sets).values(initialSetsByCard.flat()).returning({ id: sets.id });

  // insertedSetsはinitialSetsByCardをflattenした順序のまま返るため、各カードのセット数だけ
  // 先頭から切り出せば、そのカードに実際に挿入されたセットidが分かる。前回の記録が無いカードは
  // previousSetsByCard[i]が空のため、cardSetIdsは（freshSetValuesの1件のみで）prefilledSetIdsに
  // 含めない
  let cursor = 0;
  for (let i = 0; i < result.length; i++) {
    const cardSetCount = initialSetsByCard[i].length;
    const cardSetIds = insertedSets.slice(cursor, cursor + cardSetCount).map((s) => s.id);
    cursor += cardSetCount;
    result[i].prefilledSetIds = computePrefilledSetIds(cardSetIds, previousSetsByCard[i]);
  }
  return result;
}

// 種目追加ピッカーで選ばれた種目をセッションに追加する。過去にその種目をやったことがあれば
// 前回のセット列（値・セット数とも）を自動で挿入する。呼び出し側（画面）が最初の入力欄への
// オートフォーカス・ゴースト表示に使えるよう、前回の記録の有無に関わらず追加した全カードの情報を返す
export async function addExercisesToSession(
  sessionId: number,
  exerciseIds: number[],
): Promise<PrefilledCard[]> {
  if (exerciseIds.length === 0) return [];
  const now = Date.now();
  return db.transaction((tx) =>
    insertSessionExerciseCards(
      tx,
      sessionId,
      exerciseIds.map((exerciseId) => ({ exerciseId })),
      now,
      'new',
      (t, spec) => getPreviousSets(t, spec.exerciseId, sessionId),
    ),
  );
}

export type HistoryCardSelection = { exerciseId: number; sourceWorkoutSessionExerciseId: number };

// 「過去のトレーニングを選ぶ」→「読み込む種目を選ぶ」画面用。選んだ過去カード群を今日のセッションに
// 新規カードとして一括追加する。addExercisesToSessionと違い「その種目の直近の記録」ではなく、
// ユーザーが画面上で確認した「選んだ過去カードそのもの」のセット値をコピーする（見た値と入る値が
// 一致することを保証するため）。同じ種目が今日のセッションに既にあっても上書きはせず、常に
// 新規カードとして追加する（種目追加ピッカーと同じ「同じ種目を複数回追加できる」仕様を踏襲）。
// kindは（loadHistoryIntoSessionExerciseと同じ'history'ではなく）'new'にする。ここで作るのは
// 既存カードの差し替えではなく常に新規のworkoutSessionExercises行なので、種目追加ピッカーと
// 同様にapp/workout/[id].tsxのオートフォーカス・自動スクロール対象（kind==='new'）に含める必要がある
// （@designerレビュー: 'history'のままだと一覧末尾に追加されても画面がスクロールせず、
// 読み込みが成功したかユーザーが確認できないというUXバグになるため修正）
export async function addHistoryCardsToSession(
  sessionId: number,
  selections: HistoryCardSelection[],
): Promise<PrefilledCard[]> {
  if (selections.length === 0) return [];
  const now = Date.now();
  return db.transaction((tx) =>
    insertSessionExerciseCards(tx, sessionId, selections, now, 'new', (t, spec) =>
      getPreviousSetsForCard(t, spec.sourceWorkoutSessionExerciseId),
    ),
  );
}

type RoutineExerciseCardSpec = ExerciseCardSpec & { routineExerciseId: number };

// ルーティンの種目群(exercises)を、既存tx・sessionIdへ新規カードとして流し込む共通処理。
// startWorkoutFromRoutine（新規セッション作成時）とaddRoutineExercisesToSession（進行中セッションへの
// 追加時）の両方から呼ばれる。completedAtは常にnull・prefilledSetIdsで返すことで、他のプリフィル
// 経路と同じ「値はあるが✓未確定」のゴースト表示にする(実績値ではなく目標値であることが伝わり、
// 誤って「今日もうこのセットをやった」ように見えることを防ぐ)
function insertRoutineCardsIntoSession(
  tx: Tx,
  sessionId: number,
  exercises: Pick<RoutineDetailExercise, 'id' | 'exerciseId' | 'sets'>[],
  now: number,
): Promise<PrefilledCard[]> {
  const routineSetsByExerciseId = new Map(exercises.map((e) => [e.id, e.sets]));
  return insertSessionExerciseCards(
    tx,
    sessionId,
    exercises.map((e) => ({ exerciseId: e.exerciseId, routineExerciseId: e.id })),
    now,
    'new',
    // setNumberはPreviousSetValues型を満たすためだけに渡している。実際の番号はこの後
    // buildInitialSetsが1から振り直すため、routineSets側の値(欠番/重複があり得る)は使われない
    async (_tx, spec: RoutineExerciseCardSpec) =>
      (routineSetsByExerciseId.get(spec.routineExerciseId) ?? []).map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
      })),
  );
}

// startWorkoutFromRoutine/startPastWorkoutFromRoutine共通のセッション作成本体。
// ルーティンは種目1件以上が保存時の必須条件(zodバリデーション)のため通常は起こらないが、
// 万一0件のまま保存されていた場合に、種目の無い空のセッションだけを作ってしまわないための防御
async function createRoutineSession(
  routineId: number,
  startedAt: number,
  endedAt: number | null,
): Promise<{ sessionId: number; cards: PrefilledCard[] } | null> {
  const detail = await getRoutineDetail(routineId);
  if (!detail || detail.exercises.length === 0) return null;

  const now = Date.now();

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({ routineId, startedAt, endedAt, createdAt: now, updatedAt: now })
      .returning();

    const cards = await insertRoutineCardsIntoSession(tx, session.id, detail.exercises, now);

    return { sessionId: session.id, cards };
  });
}

// ルーティン一覧のカードタップ・ルーティン由来リマインダーの通知タップ用。新規セッションを作り、
// そのルーティンに登録済みの種目・目標セット(routineSets)を最初から入れた状態で返す
export async function startWorkoutFromRoutine(routineId: number) {
  return createRoutineSession(routineId, Date.now(), null);
}

// カレンダー過去日パネル「記録を追加」→「ルーティン」経由用（2026-07-20）。
// createPastWorkoutSessionと同じくstartedAt=endedAt=pastDateで作成し、ルーティンの種目・
// 目標セットは通常のstartWorkoutFromRoutineと同じくその場で流し込む
export async function startPastWorkoutFromRoutine(routineId: number, pastDate: number) {
  return createRoutineSession(routineId, pastDate, pastDate);
}

// カレンダーの「直接追加」予定（scheduledWorkoutExercises、2026-07-20）をscheduledWorkoutId
// から実施する用。今日パネルの予定カード「開始」ボタン(app/(tabs)/calendar.tsx)・その予定の
// 通知タップ(lib/notifications/tap-handler.ts)の両方から呼ばれる。routineIdは渡さず
// (schema既定のnullのまま)、手動開始と同じ「トレーニング中」表示になる。
// 種目ごとに、種目編集画面(app/calendar/schedule-workout-edit.tsx)で設定した目標セット
// (scheduledWorkoutSets)があればそれをそのままコピーし（ルーティン開始時と同じ挙動、
// 2026-07-20確定）、未設定なら従来通り種目ごとの前回記録にフォールバックする
export async function startWorkoutFromScheduledWorkout(
  scheduledWorkoutId: number,
): Promise<{ sessionId: number; cards: PrefilledCard[] } | null> {
  const rows = await db
    .select({
      exerciseId: scheduledWorkoutExercises.exerciseId,
      scheduledWorkoutExerciseId: scheduledWorkoutExercises.id,
    })
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .orderBy(scheduledWorkoutExercises.orderIndex);
  if (rows.length === 0) return null;

  const now = Date.now();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({ startedAt: now, endedAt: null, createdAt: now, updatedAt: now })
      .returning();

    const cards = await insertSessionExerciseCards(tx, session.id, rows, now, 'new', async (t, spec) => {
      const targetSets = await getScheduledWorkoutSetsForExercise(t, spec.scheduledWorkoutExerciseId);
      return targetSets.length > 0 ? targetSets : getPreviousSets(t, spec.exerciseId, session.id);
    });

    return { sessionId: session.id, cards };
  });
}

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」用。選んだルーティンのうち、画面3で
// ユーザーがチェックボックスで選んだ種目だけを既存セッションへ新規カードとして追加する。
// addHistoryCardsToSessionと同じく、クライアントには選んだ種目のid(routineExerciseId)だけを
// 送らせ、実際の目標セット値はここでDBから改めて取得する(クライアント側の値を信用しない)
export async function addRoutineExercisesToSession(
  sessionId: number,
  routineId: number,
  selections: RoutineExerciseSelection[],
): Promise<PrefilledCard[]> {
  if (selections.length === 0) return [];
  const detail = await getRoutineDetail(routineId);
  if (!detail) return [];
  // detail.exercises(orderIndex順)をfilterすることで、一部だけ選択してもselectionsの並びが
  // クリック順ではなくルーティン内の表示順のまま保たれる(SessionHistoryLoadViewのhandleSubmitと同じ考え方)
  const selectedIds = new Set(selections.map((s) => s.routineExerciseId));
  const selectedExercises = detail.exercises.filter((e) => selectedIds.has(e.id));
  if (selectedExercises.length === 0) return [];

  const now = Date.now();
  return db.transaction((tx) => insertRoutineCardsIntoSession(tx, sessionId, selectedExercises, now));
}

// 種目カードの「⋮」メニューの「削除」。sets側はworkoutSessionExerciseIdにonDelete cascadeが
// 張られているため、このカード（workoutSessionExercises行）を消せば記録済みセットも連動して消える
export async function removeExerciseFromSession(sessionExerciseId: number) {
  await db.delete(workoutSessionExercises).where(eq(workoutSessionExercises.id, sessionExerciseId));
}

// 記録編集画面「⋮」メニューの「削除」。workoutSessionExercises/setsとも
// sessionIdにonDelete cascadeが張られているため、このセッション行を消せば
// 種目・セットもすべて連動して消える
export async function deleteSession(sessionId: number) {
  await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
}

// 種目カードの「⋮」メニューの「上へ移動」「下へ移動」。orderIndexにユニーク制約は無いため、
// 隣接する2行のorderIndexを単純に入れ替えるだけで並び順を反映できる
export async function swapExerciseOrder(sessionExerciseId: number, targetSessionExerciseId: number) {
  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({ orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    const [b] = await tx
      .select({ orderIndex: workoutSessionExercises.orderIndex })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, targetSessionExerciseId));
    if (!a || !b) return;
    await tx
      .update(workoutSessionExercises)
      .set({ orderIndex: b.orderIndex })
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    await tx
      .update(workoutSessionExercises)
      .set({ orderIndex: a.orderIndex })
      .where(eq(workoutSessionExercises.id, targetSessionExerciseId));
  });
}

// ヘッダー⋮「並び替え」(app/workout/exercise-reorder.tsx)。ドラッグで確定した任意の並び順を
// まとめてDBへ反映する。swapExerciseOrder（隣接2件だけの入れ替え）と違い、渡された配列の並び順
// そのものを0始まりのorderIndexとして振り直す。他セッションの行を誤って書き換えないよう
// sessionIdでスコープする
export async function reorderSessionExercises(sessionId: number, orderedSessionExerciseIds: number[]) {
  if (orderedSessionExerciseIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [orderIndex, sessionExerciseId] of orderedSessionExerciseIds.entries()) {
      await tx
        .update(workoutSessionExercises)
        .set({ orderIndex })
        .where(
          and(
            eq(workoutSessionExercises.id, sessionExerciseId),
            eq(workoutSessionExercises.sessionId, sessionId),
          ),
        );
    }
  });
}

// 種目カードの「⋮」メニューの「種目を入れ替え」。既存のswapExerciseOrder（並び順の入れ替え）と
// 名前が紛らわしくならないよう、こちらは種目そのものの置換であることが分かる名前にしている。
// 入れ替え後は種目追加ピッカーで新規に種目を追加した直後と同じ状態にする方針のため、
// 既存のセットは計測タイプの一致有無に関わらずすべて削除し、入れ替え先の種目に前回の記録が
// あればそのセット列を、無ければ値が空でsetNumber=1のセットを1件だけ作り直す
// （addExercisesToSessionの自動生成ロジックと同じ形）
export async function replaceSessionExercise(
  sessionExerciseId: number,
  newExerciseId: number,
): Promise<PrefilledCard | null> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ exerciseId: workoutSessionExercises.exerciseId, sessionId: workoutSessionExercises.sessionId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse || wse.exerciseId === newExerciseId) return null;

    await tx
      .update(workoutSessionExercises)
      .set({ exerciseId: newExerciseId })
      .where(eq(workoutSessionExercises.id, sessionExerciseId));

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    // 値が1つも無い行はコピー対象から除外する（addExercisesToSessionと同じ理由）
    const previousSets = (await getPreviousSets(tx, newExerciseId, wse.sessionId)).filter(hasAnyValue);
    const insertedSets = await tx
      .insert(sets)
      .values(buildInitialSets(wse.sessionId, newExerciseId, sessionExerciseId, now, previousSets))
      .returning({ id: sets.id });

    return {
      sessionId: wse.sessionId,
      exerciseId: newExerciseId,
      sessionExerciseId,
      kind: 'swap',
      prefilledSetIds: computePrefilledSetIds(insertedSets.map((s) => s.id), previousSets),
    };
  });
}

// 「過去の記録から読み込む」画面で選んだ過去のカード（historyWorkoutSessionExerciseId）の
// セット列を、このカード（sessionExerciseId）にコピーする。既存のセットは全て削除する。
// completedAtは常にnull（✓は自動タップしない。ghost表示にしてユーザーに確認させる方針はプリフィルと同じ）
export async function loadHistoryIntoSessionExercise(
  sessionExerciseId: number,
  historyWorkoutSessionExerciseId: number,
): Promise<{ prefilledSetIds: number[] }> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [wse] = await tx
      .select({ sessionId: workoutSessionExercises.sessionId, exerciseId: workoutSessionExercises.exerciseId })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, sessionExerciseId));
    if (!wse) return { prefilledSetIds: [] };

    // 値が1つも無い行はコピー対象から除外する（addExercisesToSessionと同じ理由）
    const historySets = (await getPreviousSetsForCard(tx, historyWorkoutSessionExerciseId)).filter(hasAnyValue);

    await tx.delete(sets).where(eq(sets.workoutSessionExerciseId, sessionExerciseId));
    const insertedSets = await tx
      .insert(sets)
      .values(buildInitialSets(wse.sessionId, wse.exerciseId, sessionExerciseId, now, historySets))
      .returning({ id: sets.id });

    return {
      prefilledSetIds: computePrefilledSetIds(insertedSets.map((s) => s.id), historySets),
    };
  });
}

