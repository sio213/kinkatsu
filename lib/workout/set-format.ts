import type { MeasurementType } from '@/lib/exercises/constants';

// 時間(分:秒)入力を秒数に変換する。"1:30"→90、"45"のような素の数値は秒として扱う。
// 負数・"1:75"のような不正な秒（60以上）はnull（保存させない）
export function parseDurationInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const mmss = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const asSeconds = Number(trimmed);
    return Number.isFinite(asSeconds) ? Math.round(asSeconds) : null;
  }
  return null;
}

// 秒数を"分:秒"表示にする（例: 90→"1:30"）
export function formatDurationDisplay(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 距離はUIではkm、DB(distanceMeters)ではmで保持する。負の距離は物理的にありえないため拒否する
export function parseDistanceKmInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const km = Number(trimmed);
  return Number.isFinite(km) ? km * 1000 : null;
}

export function formatDistanceKmDisplay(meters: number | null | undefined): string {
  if (meters == null) return '';
  const km = Math.round((meters / 1000) * 100) / 100;
  // 5 → "5.0" のように小数第1位は必ず表示する（2.55のような詳細な値はそのまま保持）
  return Number.isInteger(km) ? km.toFixed(1) : String(km);
}

// 重量は負の値を入れる実運用が無いため拒否する（"12abc"のような末尾ゴミ文字も拒否）
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// 回数も同様に負の値・末尾ゴミ文字（"12abc"等）を拒否する。parseNumberInputと違い整数のみ許可する
export function parseIntInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export type SetFieldKey = 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters';

export type SetColumn = {
  key: SetFieldKey;
  label: string;
  keyboardType: 'decimal-pad' | 'number-pad' | 'default';
  toDisplay: (value: number | null | undefined) => string;
  fromDisplay: (text: string) => number | null;
};

const WEIGHT_COLUMN: SetColumn = {
  key: 'weight',
  label: '重量(kg)',
  keyboardType: 'decimal-pad',
  toDisplay: (v) => (v == null ? '' : String(v)),
  fromDisplay: parseNumberInput,
};

const REPS_COLUMN: SetColumn = {
  key: 'reps',
  label: '回数',
  keyboardType: 'number-pad',
  toDisplay: (v) => (v == null ? '' : String(v)),
  fromDisplay: parseIntInput,
};

const DURATION_COLUMN: SetColumn = {
  key: 'durationSeconds',
  label: '時間(分:秒)',
  keyboardType: 'default',
  toDisplay: formatDurationDisplay,
  fromDisplay: parseDurationInput,
};

const DURATION_COLUMN_SHORT: SetColumn = { ...DURATION_COLUMN, label: '時間' };

const DISTANCE_COLUMN: SetColumn = {
  key: 'distanceMeters',
  label: '距離(km)',
  keyboardType: 'decimal-pad',
  toDisplay: formatDistanceKmDisplay,
  fromDisplay: parseDistanceKmInput,
};

// 計測タイプごとに、セット行へ表示・入力する列（順序どおり）
export const MEASUREMENT_COLUMNS: Record<MeasurementType, SetColumn[]> = {
  weight_reps: [WEIGHT_COLUMN, REPS_COLUMN],
  reps: [REPS_COLUMN],
  time: [DURATION_COLUMN],
  distance_time: [DISTANCE_COLUMN, DURATION_COLUMN_SHORT],
  weight_time: [WEIGHT_COLUMN, DURATION_COLUMN_SHORT],
};

// 列定義に沿って、DB値（weight/reps等）をセル表示用の文字列に変換する
export function toDisplayValues(
  columns: SetColumn[],
  values: Partial<Record<SetFieldKey, number | null | undefined>>,
): Partial<Record<SetFieldKey, string>> {
  return Object.fromEntries(columns.map((c) => [c.key, c.toDisplay(values[c.key])]));
}

// 列定義に沿って、セル表示用の文字列をDB保存用の値にパースする。
// 空欄・不正な入力は共にnullになる（呼び出し側で不正入力を検知したい場合は
// 各列のfromDisplayを直接使って個別に判定すること。set-row.tsxの✓保存時が該当）
export function parseColumns(
  columns: SetColumn[],
  display: Partial<Record<SetFieldKey, string>>,
): Partial<Record<SetFieldKey, number | null>> {
  return Object.fromEntries(columns.map((c) => [c.key, c.fromDisplay(display[c.key] ?? '')]));
}
