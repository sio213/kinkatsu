import { db } from '@/db/client';
import { sets, workoutSessionExercises, workoutSessions } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PreviousSetValues = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// 種目の「前回の記録」を取得する。同じ種目が1セッション内に複数カード（ウォームアップ用＋本番用等）で
// 追加できる仕様のため、セッション単位ではなくカード（workoutSessionExercises）単位で直近の1枚を
// 特定してから、そのカードのセット列を返す。✓未確定（completedAt null）のセットも「前回入力した値」
// として含める（✓を押し忘れて終了したセッションの入力も前回の記録として活かすため）。
// excludeSessionIdには呼び出し元の（今まさに種目を追加している）セッションを渡し、
// 自分自身を「前回」として参照しないようにする。
export async function getPreviousSets(
  tx: Tx,
  exerciseId: number,
  excludeSessionId: number,
): Promise<PreviousSetValues[]> {
  const [latestCard] = await tx
    .select({ workoutSessionExerciseId: sets.workoutSessionExerciseId })
    .from(sets)
    .innerJoin(workoutSessionExercises, eq(sets.workoutSessionExerciseId, workoutSessionExercises.id))
    .innerJoin(workoutSessions, eq(workoutSessionExercises.sessionId, workoutSessions.id))
    .where(
      and(eq(sets.exerciseId, exerciseId), ne(workoutSessionExercises.sessionId, excludeSessionId)),
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

export type HistorySetValues = PreviousSetValues & { completedAt: number | null };

export type HistoryEntry = {
  workoutSessionExerciseId: number;
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
      startedAt: c.startedAt,
      sets: setsByCard.get(c.workoutSessionExerciseId) ?? [],
    }))
    .filter((entry) => entry.sets.some((s) => s.completedAt != null));
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
