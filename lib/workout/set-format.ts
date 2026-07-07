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

// formatDurationDisplay由来の"mm:ss"文字列を、分・秒を別々の数値入力欄に分けて
// 表示するためのペアに分解する（set-row.tsxのDurationInputが使う）
export function splitDurationDisplay(value: string): { min: string; sec: string } {
  const match = value.trim().match(/^(\d+):(\d{1,2})$/);
  if (!match) return { min: '', sec: '' };
  return { min: match[1], sec: match[2] };
}

// splitDurationDisplayの逆変換。分・秒どちらか一方が空欄でも、parseDurationInputが
// パースできる"mm:ss"形式に補完する（空欄は0扱い。両方空欄なら空文字＝未入力のまま）
export function combineDurationDisplay(min: string, sec: string): string {
  if (min === '' && sec === '') return '';
  return `${min || '0'}:${sec || '0'}`;
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

const SET_FIELD_KEYS: readonly SetFieldKey[] = ['weight', 'reps', 'durationSeconds', 'distanceMeters'];

// 計測タイプによらず、4つの値カラムのいずれかに値が入っているか。ゴースト表示
// （✓未確定のまま値がある行）の判定に、種目カード単位・セット行単位の両方から使う
export function hasAnyMeasurementValue(
  values: Partial<Record<SetFieldKey, number | null | undefined>>,
): boolean {
  return SET_FIELD_KEYS.some((k) => values[k] != null);
}

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

// 列定義に沿って、DB値（weight/reps等）をセル表示用の文字列に変換する。
// Object.fromEntriesは配列の要素型からタプルを推論できず戻り値がanyになるため、
// reduceで組み立てて戻り値の型注釈が実際に効くようにする
export function toDisplayValues(
  columns: SetColumn[],
  values: Partial<Record<SetFieldKey, number | null | undefined>>,
): Partial<Record<SetFieldKey, string>> {
  return columns.reduce<Partial<Record<SetFieldKey, string>>>((acc, c) => {
    acc[c.key] = c.toDisplay(values[c.key]);
    return acc;
  }, {});
}

// 列定義に沿って、セル表示用の文字列をDB保存用の値にパースする。
// 空欄・不正な入力は共にnullになる（呼び出し側で不正入力を検知したい場合は
// 各列のfromDisplayを直接使って個別に判定すること。set-row.tsxの✓保存時が該当）。
// fallbackを指定しないparseColumnsWithFallbackの薄いラッパー
export function parseColumns(
  columns: SetColumn[],
  display: Partial<Record<SetFieldKey, string>>,
): Partial<Record<SetFieldKey, number | null>> {
  return parseColumnsWithFallback(columns, display, {});
}

// parseColumnsと同様だが、パースに失敗した非空入力（例:"60kg"のような不正な貼り付け、
// "82.5"を打つ途中の"82."のような一瞬だけ不正な状態）はnullにせずfallback（通常はDB上の
// 既存値）を使う。「セット追加」時の入力途中値コピーや自動保存で、タイプミス・入力途中の
// 一瞬によって値が黙って消えるのを防ぐためのもの。空欄は従来通りnullになる
export function parseColumnsWithFallback(
  columns: SetColumn[],
  display: Partial<Record<SetFieldKey, string>>,
  fallback: Partial<Record<SetFieldKey, number | null | undefined>>,
): Partial<Record<SetFieldKey, number | null>> {
  return columns.reduce<Partial<Record<SetFieldKey, number | null>>>((acc, c) => {
    const text = (display[c.key] ?? '').trim();
    const parsed = c.fromDisplay(text);
    acc[c.key] = parsed == null && text !== '' ? (fallback[c.key] ?? null) : parsed;
    return acc;
  }, {});
}
