import { db, type DbOrTx } from '@/db/client';
import { exercises, sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import { type MeasurementType } from '@/lib/exercises/constants';
import { pickPrimaryCategory, type PastTrainingSessionExercise } from '@/lib/workout/session-category';
import { hasAnyValue, type PreviousSetValues } from '@/lib/workout/set-values';
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';

// DBに依存しないモジュール(lib/routines/validation.ts・lib/routines/naming.ts等)からも
// 安全にimportできるようlib/workout/set-values.ts・lib/workout/session-category.tsに
// 切り出した実体をそのまま再エクスポートする(既存の
// import { hasAnyValue } from '@/lib/workout/history' 等を壊さないため)
export { hasAnyValue, pickPrimaryCategory, type PastTrainingSessionExercise, type PreviousSetValues };

// excludeSessionIdは通常「今まさに編集中のセッション」を渡し自分自身を実績として参照しない
// ようにするためのものだが、ルーティン編集にはそもそも「セッション」という概念が無い。
// どのセッションidとも一致し得ないこの番兵値を渡すことで「何も除外しない」を表現する
// (app/routine/exercise-edit.tsx・app/routine/history-picker.tsxで共有)
export const NO_SESSION_TO_EXCLUDE = -1;

// 種目の「前回の記録」を取得する。同じ種目が1セッション内に複数カード（ウォームアップ用＋本番用等）で
// 追加できる仕様のため、セッション単位ではなくカード（workoutSessionExercises）単位で直近の1枚を
// 特定してから、そのカードのセット列を返す。✓未確定（completedAt null）のセットも「前回入力した値」
// として含める（✓を押し忘れて終了したセッションの入力も前回の記録として活かすため）。
// excludeSessionIdには呼び出し元の（今まさに種目を追加している）セッションを渡し、
// 自分自身を「前回」として参照しないようにする。セッションの外（ルーティンのテンプレートセット
// プリフィル等）から呼ぶ場合は省略でき、その場合は全セッションが対象になる。
export async function getPreviousSets(
  tx: DbOrTx,
  exerciseId: number,
  excludeSessionId?: number,
): Promise<PreviousSetValues[]> {
  const [latestCard] = await tx
    .select({ workoutSessionExerciseId: sets.workoutSessionExerciseId })
    .from(sets)
    .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
    .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .where(
      excludeSessionId != null
        ? and(eq(sets.exerciseId, exerciseId), ne(workoutSessionExercises.sessionId, excludeSessionId))
        : eq(sets.exerciseId, exerciseId),
    )
    // 同じ過去セッション内に同じ種目のカードが複数あるケース（ウォームアップ/本番等）の
    // タイブレークとしてカードid降順（＝そのセッション内で後から追加されたカード）も見る
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessionExercises.id))
    .limit(1);

  if (!latestCard) return [];

  return tx
    .select({
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
    })
    .from(sets)
    .where(eq(sets.workoutSessionExerciseId, latestCard.workoutSessionExerciseId))
    .orderBy(sets.setNumber);
}

// 特定の過去カード（workoutSessionExerciseId）のセット列をそのまま返す。getPreviousSets
// （種目単位で直近の1枚を自動で特定する）と違い、こちらは「記録から読み込む」画面（種目単位・
// セッション単位どちらも、lib/workout/session.ts）でユーザーが選んだカードそのものを対象にする。
// lib/calendar/scheduled-workout-detail.tsのaddHistoryCardsToScheduledWorkoutからも使うため
// （session.tsとscheduled-workout-detail.tsが互いをimportし合う循環参照を避ける）、両者から
// 依存されて問題ない下位モジュールのこちらに置く
export async function getPreviousSetsForCard(
  tx: DbOrTx,
  workoutSessionExerciseId: number,
): Promise<PreviousSetValues[]> {
  return tx
    .select({
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
    })
    .from(sets)
    .where(eq(sets.workoutSessionExerciseId, workoutSessionExerciseId))
    .orderBy(sets.setNumber);
}

export type HistorySetValues = PreviousSetValues & { completedAt: number | null };

export type HistoryEntry = {
  workoutSessionExerciseId: number;
  sessionId: number;
  startedAt: number;
  sets: HistorySetValues[];
};

// 「過去の記録から読み込む」画面用。excludeSessionIdの種目の過去カードを全件、新しい順で返す。
// getPreviousSetsと違い直近の1枚だけでなく全件が対象なので、まずカード（id・開始日時）を
// 一覧取得してからそのidの集合でsetsをまとめて取り、JS側でカードごとにグルーピングする
// （カードの数だけクエリを発行すると件数が増えるほど無駄が増えるため）。
// 進行中セッション（endedAt null）のカードは「まだ確定していない記録」のため対象外にし、
// ✓確定セットが1件も無いカード（追加しただけで記録しなかった等）も一覧に出す意味が無いため除く
export async function getExerciseHistoryEntries(
  exerciseId: number,
  excludeSessionId: number,
): Promise<HistoryEntry[]> {
  const cards = await db
    .select({
      workoutSessionExerciseId: workoutSessionExercises.id,
      sessionId: workoutSessionExercises.sessionId,
      startedAt: workoutSessions.startedAt,
    })
    .from(workoutSessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessionExercises.exerciseId, exerciseId),
        ne(workoutSessionExercises.sessionId, excludeSessionId),
        isNotNull(workoutSessions.endedAt),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessionExercises.id));

  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const allSets = await db
    .select({
      workoutSessionExerciseId: sets.workoutSessionExerciseId,
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
      completedAt: sets.completedAt,
    })
    .from(sets)
    .where(inArray(sets.workoutSessionExerciseId, cardIds))
    .orderBy(sets.setNumber);

  const setsByCard = new Map<number, typeof allSets>();
  for (const s of allSets) {
    const list = setsByCard.get(s.workoutSessionExerciseId);
    if (list) {
      list.push(s);
    } else {
      setsByCard.set(s.workoutSessionExerciseId, [s]);
    }
  }

  return cards
    .map((c) => ({
      workoutSessionExerciseId: c.workoutSessionExerciseId,
      sessionId: c.sessionId,
      startedAt: c.startedAt,
      sets: setsByCard.get(c.workoutSessionExerciseId) ?? [],
    }))
    .filter((entry) => entry.sets.some((s) => s.completedAt != null));
}

export type PastTrainingSession = {
  sessionId: number;
  startedAt: number;
  exercises: PastTrainingSessionExercise[];
};

export type PastTrainingSessionsPage = {
  sessions: PastTrainingSession[];
  hasMore: boolean;
};

// 「過去のトレーニングを選ぶ」画面用。excludeSessionId以外の終了済みセッションを新しい順でページ単位に返す。
// グルーピングの単位はカレンダー上の「日」ではなく「セッション」であることに注意
// （同じ日に2回トレーニングしていれば2件になる。画面側で同日をまとめて1カードにする場合は
// 呼び出し側で追加のグルーピングが必要）。ヘビーユーザーほどセッション数が線形に増え全件JOINが
// 重くなるため、まずworkoutSessions単体をlimit/offsetでページングしてから、そのページ分の
// セッションidだけでカード・確定セット有無を取得する（全件取得はしない）。
// ページングの単位（1段目のクエリ）は最終的な表示の単位（✓確定セットを持つカードが1件以上ある
// セッション）と必ず一致させる。1段目でsets.completedAtを見ずに終了済みというだけでページングすると、
// そのページ全体が「追加しただけで記録しなかった」セッションだけだった場合にsessions=[]なのに
// hasMore=trueという状態が起こり、画面側が「記録がありません」の空表示で止まってしまう
// （SectionListが空になりonEndReachedの配線自体が無くなるため、それより古い記録に永久に到達できない）。
// そのためsets.completedAt IS NOT NULLの行までJOINしてselectDistinctし、1段目の時点で
// 「表示され得るセッションだけ」に絞り込む。
// limit+1件フェッチして実際にlimit件を超えていればhasMore=trueとし、次ページの有無をカウント
// クエリ無しで判定する
export async function getPastTrainingSessions(
  excludeSessionId: number,
  { limit, offset }: { limit: number; offset: number },
): Promise<PastTrainingSessionsPage> {
  const sessionRows = await db
    .selectDistinct({ id: workoutSessions.id, startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .innerJoin(workoutSessionExercises, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .innerJoin(sets, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
    .where(
      and(
        ne(workoutSessions.id, excludeSessionId),
        isNotNull(workoutSessions.endedAt),
        isNotNull(sets.completedAt),
      ),
    )
    // startedAtが同値のセッションが複数あるとページ境界での重複・欠落が起こりうるため、
    // idを第2キーにしてページングの並び順を決定的にする（getPreviousSetsのdesc(id)と同じ方針）
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = sessionRows.length > limit;
  const pageSessionIds = (hasMore ? sessionRows.slice(0, limit) : sessionRows).map((r) => r.id);
  if (pageSessionIds.length === 0) return { sessions: [], hasMore: false };

  // getExerciseHistoryEntriesと同じ方針で、まずカード一覧（種目メタ情報つき）を1クエリで取得し、
  // 別クエリでカードごとの✓確定セットの有無をまとめて調べてからJS側でセッション単位にグルーピングする
  const cards = await db
    .select({
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      workoutSessionExerciseId: workoutSessionExercises.id,
      exerciseId: exercises.id,
      name: exercises.name,
      category: exercises.category,
    })
    .from(workoutSessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
    .where(inArray(workoutSessionExercises.sessionId, pageSessionIds))
    // 1段目と同じタイブレークを使い、startedAtが同値のセッション同士の出現順を1段目と一致させる
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id), workoutSessionExercises.orderIndex);

  // pageSessionIdsは「✓確定セットを持つカードが1件以上ある」ことをJOINで保証したセッションだけなので、
  // 対応するカードが1件も無い（cards.length === 0になる）ことはない
  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const confirmedCards = await db
    .selectDistinct({ workoutSessionExerciseId: sets.workoutSessionExerciseId })
    .from(sets)
    .where(and(inArray(sets.workoutSessionExerciseId, cardIds), isNotNull(sets.completedAt)));
  const confirmedIds = new Set(confirmedCards.map((c) => c.workoutSessionExerciseId));

  // Mapは挿入順を保持するため、cardsが既にstartedAt降順・orderIndex昇順でソート済みであれば
  // そのままセッションの出現順・種目の並び順として使える
  const sessionsById = new Map<number, PastTrainingSession>();
  for (const c of cards) {
    if (!confirmedIds.has(c.workoutSessionExerciseId)) continue;
    let entry = sessionsById.get(c.sessionId);
    if (!entry) {
      entry = { sessionId: c.sessionId, startedAt: c.startedAt, exercises: [] };
      sessionsById.set(c.sessionId, entry);
    }
    entry.exercises.push({ exerciseId: c.exerciseId, name: c.name, category: c.category });
  }
  return { sessions: Array.from(sessionsById.values()), hasMore };
}

export type SessionHistoryCard = {
  workoutSessionExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  // サムネイル表示（getExerciseImages）に必要。Exercise型のPick<'source'|'slug'>と同じ形にしておく
  source: string;
  slug: string | null;
  // 器具を同時に2つ扱う種目か。総重量を左右2つ分で数えるグラフ（useExerciseProgress）へ
  // そのまま渡せるよう、カード側に含めておく
  pairedWeights: boolean;
  sets: HistorySetValues[];
};

// 「読み込む種目を選ぶ」画面・カレンダー日別詳細で共用。指定した過去セッション内のカードを、
// 種目情報とセット内容つきでorderIndex順に返す。デフォルトは✓確定セットが1件も無いカードを
// 対象外にする（getExerciseHistoryEntriesと同じ理由。読み込み画面は過去の「確定した」値を
// 引き継ぐための機能なので下書きを含めない）。カレンダー日別詳細のように未確定カードも
// そのまま表示したい呼び出し元はincludeUnconfirmedCards: trueを渡す
// （measurementTypeは想定外のDB値でも画面側でフォールバックできるようstringのまま返す。
// exercise-history-picker-view.tsxのexerciseと同じ扱い）
export async function getSessionExerciseCards(
  sessionId: number,
  options?: { includeUnconfirmedCards?: boolean },
): Promise<SessionHistoryCard[]> {
  const cards = await db
    .select({
      workoutSessionExerciseId: workoutSessionExercises.id,
      exerciseId: exercises.id,
      name: exercises.name,
      category: exercises.category,
      measurementType: exercises.measurementType,
      source: exercises.source,
      slug: exercises.slug,
      pairedWeights: exercises.pairedWeights,
    })
    .from(workoutSessionExercises)
    .innerJoin(exercises, eq(workoutSessionExercises.exerciseId, exercises.id))
    .where(eq(workoutSessionExercises.sessionId, sessionId))
    .orderBy(workoutSessionExercises.orderIndex);

  if (cards.length === 0) return [];

  const cardIds = cards.map((c) => c.workoutSessionExerciseId);
  const allSets = await db
    .select({
      workoutSessionExerciseId: sets.workoutSessionExerciseId,
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      durationSeconds: sets.durationSeconds,
      distanceMeters: sets.distanceMeters,
      completedAt: sets.completedAt,
    })
    .from(sets)
    .where(inArray(sets.workoutSessionExerciseId, cardIds))
    .orderBy(sets.setNumber);

  const setsByCard = new Map<number, typeof allSets>();
  for (const s of allSets) {
    const list = setsByCard.get(s.workoutSessionExerciseId);
    if (list) {
      list.push(s);
    } else {
      setsByCard.set(s.workoutSessionExerciseId, [s]);
    }
  }

  const cardsWithSets = cards.map((c) => ({
    ...c,
    sets: setsByCard.get(c.workoutSessionExerciseId) ?? [],
  }));
  if (options?.includeUnconfirmedCards) return cardsWithSets;
  return cardsWithSets.filter((card) => card.sets.some((s) => s.completedAt != null));
}

// nullを無視した最大値。全件nullならnull（0にフォールバックしない。0にすると値の無い
// セットしか無いカードが「0が自己ベスト」として誤って選ばれてしまうため）
function maxOf(values: (number | null)[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (v == null) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

// カード（entry）1件を「自己ベスト」として比較するためのスコア配列を作る。配列の前方の要素ほど
// 優先度が高く、先頭から順に比較して大きい方を勝ちとする（辞書式順序）。値が無いカード（✓確定
// セットが1件も無い等）はnullを返し、比較対象から除外する。
// セット数・総量（ボリューム）はここでは比較しない。「自己ベスト」は1セット単体の強さ
// （重量→回数/時間）で決まるものであり、何セットこなしたかは追い込み度・総負荷の指標であって
// 自己ベストの判定材料ではないというユーザーフィードバックに基づく（@user-advisorレビュー）
function computeEntryScore(measurementType: MeasurementType, entry: HistoryEntry): number[] | null {
  const confirmed = entry.sets.filter((s) => s.completedAt != null);
  if (confirmed.length === 0) return null;

  switch (measurementType) {
    case 'weight_reps': {
      const maxWeight = maxOf(confirmed.map((s) => s.weight));
      if (maxWeight == null) return null;
      // 同じ重量が複数セットあれば、その中で一番回数が多いものを比較対象にする
      const repsAtMaxWeight = maxOf(confirmed.filter((s) => s.weight === maxWeight).map((s) => s.reps)) ?? 0;
      return [maxWeight, repsAtMaxWeight];
    }
    case 'weight_time': {
      const maxWeight = maxOf(confirmed.map((s) => s.weight));
      if (maxWeight == null) return null;
      const durationAtMaxWeight =
        maxOf(confirmed.filter((s) => s.weight === maxWeight).map((s) => s.durationSeconds)) ?? 0;
      return [maxWeight, durationAtMaxWeight];
    }
    case 'reps': {
      const max = maxOf(confirmed.map((s) => s.reps));
      if (max == null) return null;
      return [max];
    }
    case 'time': {
      const max = maxOf(confirmed.map((s) => s.durationSeconds));
      if (max == null) return null;
      return [max];
    }
    case 'distance_time': {
      const max = maxOf(confirmed.map((s) => s.distanceMeters));
      if (max == null) return null;
      return [max];
    }
  }
}

// スコア配列を先頭要素から順に比較する（要素数はcomputeEntryScoreの呼び出し元同士で常に揃う）
function isHigherScore(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// 種目の全履歴の中から「自己ベスト」を1件だけ選んでカードidを返す（無ければ空のSet）。
// 比較優先順位: ①計測タイプごとの主指標（重量/回数/時間/距離）の最大値 → ②重量種目は同じ重量の
// 中での回数・時間 → ③それでも同値なら、後から同じ記録にタイしただけの日ではなく最初にその
// 記録を達成した日（＝より古い日付）を自己ベストとする。
// ✓未確定（completedAt null）のセットは「まだ確認していない値」のため指標に含めない
export function computePersonalBestIds(
  entries: HistoryEntry[],
  measurementType: MeasurementType,
): Set<number> {
  let best: { workoutSessionExerciseId: number; startedAt: number; score: number[] } | null = null;

  for (const entry of entries) {
    const score = computeEntryScore(measurementType, entry);
    if (score == null) continue;

    if (
      best == null ||
      isHigherScore(score, best.score) ||
      (!isHigherScore(best.score, score) && entry.startedAt < best.startedAt)
    ) {
      best = { workoutSessionExerciseId: entry.workoutSessionExerciseId, startedAt: entry.startedAt, score };
    }
  }

  return best ? new Set([best.workoutSessionExerciseId]) : new Set();
}
