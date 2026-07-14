import type { Reminder } from '@/db/schema';
import type { MeasurementType } from '@/lib/exercises/constants';
import { formatKindSummary } from '@/lib/notifications/format';
import { MEASUREMENT_COLUMNS, formatHistorySetSummary } from '@/lib/workout/set-format';

export type RoutineSetLike = {
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// 計測タイプごとの「代表セットを決める指標」。weight_reps/weight_timeは重量が主指標、
// reps/time/distance_timeはそれぞれ回数・時間・距離が唯一の指標になる
function primaryMetric(measurementType: MeasurementType, s: RoutineSetLike): number | null {
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

// 主指標が同値のときのタイブレーク指標。weight_repsは回数が多い方、weight_timeは
// 時間が長い方を優先する（デザインメモの「同kgなら回数が多い方」をweight_time相当にも一般化）。
// 単一指標の計測タイプはタイブレークの概念が無い
function secondaryMetric(measurementType: MeasurementType, s: RoutineSetLike): number | null {
  switch (measurementType) {
    case 'weight_reps':
      return s.reps;
    case 'weight_time':
      return s.durationSeconds;
    default:
      return null;
  }
}

// ルーティンの種目1件分の代表セットを1つ選ぶ（そのルーティン設定内で最大の主指標、
// 同値なら副指標が大きい方）。主指標が全セットnull（未入力）ならnullを返す
export function pickRepresentativeSet<T extends RoutineSetLike>(
  measurementType: MeasurementType,
  sets: T[],
): T | null {
  let best: T | null = null;
  let bestPrimary = -Infinity;
  let bestSecondary = -Infinity;
  for (const s of sets) {
    const primary = primaryMetric(measurementType, s);
    if (primary == null) continue;
    const secondary = secondaryMetric(measurementType, s) ?? -Infinity;
    if (primary > bestPrimary || (primary === bestPrimary && secondary > bestSecondary)) {
      best = s;
      bestPrimary = primary;
      bestSecondary = secondary;
    }
  }
  return best;
}

// ルーティンフォームの種目行に出す「Nセット・{代表セット}」。代表セットが決まらない
// （全セット未入力）場合は件数のみにフォールバックする
export function summarizeRoutineExerciseSets(
  measurementType: MeasurementType,
  sets: RoutineSetLike[],
): string {
  if (sets.length === 0) return '0セット';
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const best = pickRepresentativeSet(measurementType, sets);
  const summary = best ? formatHistorySetSummary(columns, [best]) : null;
  return summary ? `${sets.length}セット・${summary}` : `${sets.length}セット`;
}

// カテゴリタグの最大表示数。これを超えたら先頭からこの件数だけ表示し、残りは「+N」にまとめる
export const MAX_VISIBLE_CATEGORIES = 3;

export type CategorySummary = {
  visible: string[];
  overflowCount: number;
};

// ルーティンカードのカテゴリタグ表示。重複除去済みのcategories配列を受け取り、
// 4つ以上なら先頭3つ+overflowCountにする（並び順は呼び出し側=種目数の多い順のまま維持する。
// hooks/use-routines.tsのuseRoutineExerciseSummariesが並べ替え済みで渡してくる）
export function summarizeCategories(categories: string[]): CategorySummary {
  if (categories.length <= MAX_VISIBLE_CATEGORIES) {
    return { visible: categories, overflowCount: 0 };
  }
  return {
    visible: categories.slice(0, MAX_VISIBLE_CATEGORIES),
    overflowCount: categories.length - MAX_VISIBLE_CATEGORIES,
  };
}

export type RoutineScheduleDisplay = {
  label: string;
  // falseなら「リマインダーなし」相当のオフ表示（グレー+event_busyアイコン）
  active: boolean;
};

// ルーティンカードのスケジュール行。reminderが無い、またはトグルOFF(enabled:false)なら
// 「リマインダーなし」扱いにする（OFFのリマインダーは実際には発火しないため、一覧では
// 「無い」ものと同じに見せるのが実態に即している）
export function getRoutineScheduleDisplay(reminder: Reminder | null): RoutineScheduleDisplay {
  if (!reminder || !reminder.enabled) {
    return { label: 'リマインダーなし', active: false };
  }
  return { label: formatKindSummary(reminder), active: true };
}
