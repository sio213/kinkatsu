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

// 「記録から読み込む」画面の一覧表示専用。1分未満は"45秒"のような素の秒数、1分以上は
// set-row.tsx等と同じ"mm:ss"（formatDurationDisplay）にする。短いホールド系種目が多い
// time/weight_time計測で"90秒"のような読みにくい表記になるのを避けつつ、既存の分:秒表記とも矛盾しない
function formatHistoryDuration(seconds: number): string {
  return seconds < 60 ? `${seconds}秒` : formatDurationDisplay(seconds);
}

// 限られた横幅で1行にまとめるため単位付きの簡潔な文字列にする（例:"60kg×10","45秒"）。
// repsだけは他の列と組み合わさる場合（weight_reps）は"10"のように単位を省き、単独の場合
// （reps計測）だけ"10回"と単位を付ける。重量・時間・距離は組み合わせの有無に関わらず単位を付ける
function formatHistoryFieldValue(
  key: SetFieldKey,
  value: number | null | undefined,
  repsIsSoleColumn: boolean,
): string | null {
  if (value == null) return null;
  switch (key) {
    case 'weight':
      return `${value}kg`;
    case 'reps':
      return repsIsSoleColumn ? `${value}回` : `${value}`;
    case 'durationSeconds':
      return formatHistoryDuration(value);
    case 'distanceMeters':
      return `${formatDistanceKmDisplay(value)}km`;
  }
}

// 列定義に沿って複数セットを"60kg×10・60kg×8"のような1本の文字列にする。
// 全列nullのセット（前回「セット追加」だけ押されて未入力のまま終わった等）は、そのまま
// joinすると"60kg×10・・"のように空のセグメントが挟まってしまうため、要約から除外する
// （lib/workout/session.tsが読み込み時に同じ行をコピー対象から除外するのと一貫させる）。
// セット数が多い場合の省略（「…」）は呼び出し側でText numberOfLines={1}に任せる
export function formatHistorySetSummary(
  columns: SetColumn[],
  setsList: Partial<Record<SetFieldKey, number | null | undefined>>[],
): string {
  const repsIsSoleColumn = columns.length === 1 && columns[0].key === 'reps';
  return setsList
    .map((s) =>
      columns
        .map((c) => formatHistoryFieldValue(c.key, s[c.key], repsIsSoleColumn))
        .filter((v): v is string => v != null)
        .join('×'),
    )
    .filter((line) => line !== '')
    .join('・');
}

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

export type SetLike = {
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

// 計測タイプごとの「代表セットを決める指標」。weight_reps/weight_timeは重量が主指標、
// reps/time/distance_timeはそれぞれ回数・時間・距離が唯一の指標になる
// （lib/workout/comparison.tsの前回比較でも同じ指標定義を使うためexportしている）
export function primaryMetric(measurementType: MeasurementType, s: SetLike): number | null {
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
export function secondaryMetric(measurementType: MeasurementType, s: SetLike): number | null {
  switch (measurementType) {
    case 'weight_reps':
      return s.reps;
    case 'weight_time':
      return s.durationSeconds;
    default:
      return null;
  }
}

// 種目1件分の代表セットを1つ選ぶ（渡されたセット群の中で最大の主指標、
// 同値なら副指標が大きい方）。主指標が全セットnull（未入力）ならnullを返す
export function pickRepresentativeSet<T extends SetLike>(
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

// 「Nセット・{代表セット}」の要約文字列（ルーティンフォームの種目行・トレーニング画面の
// 折りたたみ種目カードで使用）。代表セットが決まらない（全セット未入力）場合は件数のみに
// フォールバックする
export function summarizeExerciseSets(measurementType: MeasurementType, sets: SetLike[]): string {
  if (sets.length === 0) return '0セット';
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const best = pickRepresentativeSet(measurementType, sets);
  const summary = best ? formatHistorySetSummary(columns, [best]) : null;
  return summary ? `${sets.length}セット・${summary}` : `${sets.length}セット`;
}
