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

// 計測タイプごとの「自己ベスト」の指標。重量種目は重量、回数のみは回数、時間系は長さ・距離が
// 大きいほど良い記録とみなす（フォーム種目ごとの厳密な1RM推定等は行わない、単純な最大値比較）。
// 値が未入力（null）のセットはこの指標では「記録なし」を表すため0にフォールバックしない
// （0にすると値の無いセットしか無いカードが「0が自己ベスト」として誤って一番古い記録にタグ付けされる）
function primaryMetricValue(measurementType: MeasurementType, s: PreviousSetValues): number | null {
  switch (measurementType) {
    case 'weight_reps':
    case 'weight_time':
      return s.weight;
    case 'reps':
      return s.reps;
    case 'time':
      return s.durationSeconds;
    case 'distance_time':
      return s.distanceMeters;
  }
}

// entries内で「その時点までで初めて自己ベストを更新した」カードのidを返す。同じ最大値に
// 複数回到達しても、最初に到達した回だけがタグ対象（2回目以降は「更新」ではないため）。
// ✓未確定（completedAt null）のセットは「まだ確認していない値」のため指標に含めない
export function computePersonalBestIds(
  entries: HistoryEntry[],
  measurementType: MeasurementType,
): Set<number> {
  const chronological = [...entries].sort((a, b) => a.startedAt - b.startedAt);
  let runningMax = -Infinity;
  const bestIds = new Set<number>();
  for (const entry of chronological) {
    const confirmedValues = entry.sets
      .filter((s) => s.completedAt != null)
      .map((s) => primaryMetricValue(measurementType, s))
      .filter((v): v is number => v != null);
    if (confirmedValues.length === 0) continue;
    const entryMax = Math.max(...confirmedValues);
    if (entryMax > runningMax) {
      runningMax = entryMax;
      bestIds.add(entry.workoutSessionExerciseId);
    }
  }
  return bestIds;
}
