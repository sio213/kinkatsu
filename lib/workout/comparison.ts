import type { MeasurementType } from '@/lib/exercises/constants';
import { pickRepresentativeSet, primaryMetric, secondaryMetric, type SetFieldKey, type SetLike } from './set-format';

export type SetComparison = {
  field: SetFieldKey;
  // 符号付き差分（表示用に単位変換・丸め済み。weightはkg、distanceMetersはkm換算後の値）
  delta: number;
  // "+2.5kg" "-2回" のような表示用ラベル
  label: string;
};

// 計測タイプごとに「主指標(pickRepresentativeSetの判定基準と同じ)」「副指標（あれば）」が
// どのフィールドに対応するかを表す。primaryMetric/secondaryMetricは値だけを返すため、
// どちらのフィールドの差分として表示すべきかはここで別途対応づける
const METRIC_FIELDS: Record<MeasurementType, { primary: SetFieldKey; secondary: SetFieldKey | null }> = {
  weight_reps: { primary: 'weight', secondary: 'reps' },
  weight_time: { primary: 'weight', secondary: 'durationSeconds' },
  reps: { primary: 'reps', secondary: null },
  time: { primary: 'durationSeconds', secondary: null },
  distance_time: { primary: 'distanceMeters', secondary: null },
};

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDelta(field: SetFieldKey, rawDelta: number): { delta: number; label: string } {
  const sign = rawDelta > 0 ? '+' : '-';
  switch (field) {
    case 'weight': {
      const delta = roundTo(Math.abs(rawDelta), 2);
      return { delta: rawDelta > 0 ? delta : -delta, label: `${sign}${delta}kg` };
    }
    case 'reps': {
      const delta = Math.round(Math.abs(rawDelta));
      return { delta: rawDelta > 0 ? delta : -delta, label: `${sign}${delta}回` };
    }
    case 'durationSeconds': {
      const delta = Math.round(Math.abs(rawDelta));
      return { delta: rawDelta > 0 ? delta : -delta, label: `${sign}${delta}秒` };
    }
    case 'distanceMeters': {
      // 距離は他画面（set-format.tsのDISTANCE_COLUMN）と同じくkm表示に揃える
      const delta = roundTo(Math.abs(rawDelta) / 1000, 2);
      return { delta: rawDelta > 0 ? delta : -delta, label: `${sign}${delta}km` };
    }
  }
}

// rawDeltaが0（変化なし）はもちろん、丸めた表示上は0になる極小差分（例: 重量0.001kgの誤差）も
// 「変化なし」として扱いnullを返す。ここでnullにせず返すと「+0kg」のような矢印と矛盾する
// 表示（上矢印なのにラベルは0）になってしまうため
function buildComparison(field: SetFieldKey, rawDelta: number): SetComparison | null {
  if (rawDelta === 0) return null;
  const { delta, label } = formatDelta(field, rawDelta);
  if (delta === 0) return null;
  return { field, delta, label };
}

// 今回の代表セットと前回の代表セットを比較し、変化があった指標の差分を1つ返す。
// pickRepresentativeSetと同じ「主指標が最大のセット」を両者から選び、主指標に変化があれば
// それを、主指標が同値（または丸め後に無視できる差）の場合のみ副指標（重量種目の回数/時間）の
// 変化を見る。比較対象が無い（前回記録が無い/今回が未入力）、あるいは主・副とも変化が無ければ
// nullを返す。
//
// currentSets/previousSetsは呼び出し側（hooks/use-calendar-day-exercises.ts）で
// ✓確定セットのみに絞り込んだ上で渡すこと（自己ベスト判定と基準を揃えるため）
export function compareToPrevious(
  measurementType: MeasurementType,
  currentSets: SetLike[],
  previousSets: SetLike[],
): SetComparison | null {
  const current = pickRepresentativeSet(measurementType, currentSets);
  const previous = pickRepresentativeSet(measurementType, previousSets);
  if (!current || !previous) return null;

  const fields = METRIC_FIELDS[measurementType];

  // pickRepresentativeSetが返した時点で主指標はnullでないはずだが、型上はnullを許容するため
  // 念のため??0でガードする（実際にnullになることは無い想定）
  const primaryDelta = (primaryMetric(measurementType, current) ?? 0) - (primaryMetric(measurementType, previous) ?? 0);
  const primaryResult = buildComparison(fields.primary, primaryDelta);
  if (primaryResult) return primaryResult;

  if (fields.secondary) {
    const currentSecondary = secondaryMetric(measurementType, current);
    const previousSecondary = secondaryMetric(measurementType, previous);
    if (currentSecondary != null && previousSecondary != null) {
      const secondaryResult = buildComparison(fields.secondary, currentSecondary - previousSecondary);
      if (secondaryResult) return secondaryResult;
    }
  }

  return null;
}
