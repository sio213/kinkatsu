import { PAIRED_WEIGHT_SIDES, resolveMeasurementType, type MeasurementType } from '@/lib/exercises/constants';
import { progressMetricLabel } from '@/lib/exercises/progress';

/**
 * 完了サマリーの主役数値（デザイン案の2項目目）に必要な、確定セット1件分の値。
 * DBに依存しないよう、フック側（hooks/use-session-summary.ts）が引いた行をそのまま渡す形にする
 */
export type SessionTotalRow = {
  measurementType: string;
  pairedWeights: boolean;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type SessionTotal = {
  /** 「総重量」「合計回数」など。lib/exercises/progress.ts のグラフ指標チップと同じ語を使う */
  label: string;
  /** 表示用に整形済みの値（3桁区切り・小数の丸めまで済ませたもの） */
  value: string;
  /** 値の右に小さく添える単位（「kg」「回」など） */
  unit: string;
};

/**
 * セッションの主役数値をどの計測タイプで出すか。上から順に見て、実際に足せる量があった
 * ものに決まる。
 *
 * weight_time（加重ホールド）がこの並びに居ないのは、足せる重量を持たないため
 * （lib/exercises/progress.ts の TOTAL_UNITS に weight_time が無いのと同じ理由）。
 * 代わりに保持時間を足したいので、下の classify で time 側に寄せている
 */
const TOTAL_ORDER = ['weight_reps', 'reps', 'time', 'distance_time'] as const;
type TotalKind = (typeof TOTAL_ORDER)[number];

function classify(measurementType: string): TotalKind {
  const resolved: MeasurementType = resolveMeasurementType(measurementType);
  // 加重ホールドは「その重量で何秒保ったか」なので、合計として意味を持つのは時間の側
  return resolved === 'weight_time' ? 'time' : resolved;
}

/** 表示用の単位。progress.ts の TOTAL_UNITS と語を揃えること（時間だけは下で分に切り替える） */
const UNITS: Record<TotalKind, string> = {
  weight_reps: 'kg',
  reps: '回',
  time: '秒',
  distance_time: 'km',
};

/** 合計時間が長いときの単位。UNITS.timeと対で、どちらも「合計時間」のラベルに付く */
const MINUTES_UNIT = '分';

const SECONDS_PER_MINUTE = 60;
const METERS_PER_KM = 1000;
/**
 * 合計時間を分表記に切り替える境界。グラフ（lib/exercises/progress.ts）の同名定数は600秒だが、
 * あちらが「1種目1日ぶんのベスト値」を描くのに対しこちらはセッション全体の合計で、
 * 1分を超えるのが普通なので閾値が違う。値を揃えないこと
 */
const SUMMARY_MINUTE_SWITCH_SECONDS = 60;

/**
 * その計測タイプの行だけを取り出す。
 *
 * 回数だけは例外で、計測タイプではなく**回数列に値が入っているか**で拾う。そうしないと
 * 「重量×回数の種目に回数だけ入れた」場合に合計回数へ降りられない——その行の計測タイプは
 * weight_reps のままなので、種目の分類で絞ると回数の候補が1件も見つからない。
 *
 * 逆に時間・距離を列で拾ってはいけない。距離種目は距離と時間の両方を記録する
 * （lib/workout/set-format.ts の MEASUREMENT_COLUMNS.distance_time）ため、列で拾うと
 * ランニングのセッションが TOTAL_ORDER の先にある time に吸われ、合計距離に永久に辿り着かない
 */
function rowsFor(kind: TotalKind, rows: SessionTotalRow[]): SessionTotalRow[] {
  if (kind === 'reps') return rows.filter((row) => row.reps != null);
  return rows.filter((row) => classify(row.measurementType) === kind);
}

function sumFor(kind: TotalKind, rows: SessionTotalRow[]): number {
  return rowsFor(kind, rows).reduce((total, row) => {
    switch (kind) {
      case 'weight_reps':
        // 左右2つ分を扱う種目（ダンベル種目など）は2倍。記録タブのセッションカード
        // (useSessionStats)・種目詳細の総重量と同じ倍率を掛けること
        return total + (row.weight ?? 0) * (row.reps ?? 0) * (row.pairedWeights ? PAIRED_WEIGHT_SIDES : 1);
      case 'reps':
        return total + (row.reps ?? 0);
      case 'time':
        return total + (row.durationSeconds ?? 0);
      case 'distance_time':
        return total + (row.distanceMeters ?? 0);
    }
  }, 0);
}

function format(kind: TotalKind, total: number): { value: string; unit: string } {
  switch (kind) {
    case 'weight_reps':
      // 2.5kgの種目では合計が小数になりうるが、セッション全体の総量に0.5kgの精度は意味を持たない
      return { value: Math.round(total).toLocaleString('ja-JP'), unit: UNITS.weight_reps };
    case 'reps':
      return { value: total.toLocaleString('ja-JP'), unit: UNITS.reps };
    case 'time':
      return total < SUMMARY_MINUTE_SWITCH_SECONDS
        ? { value: String(total), unit: UNITS.time }
        : { value: String(Math.round(total / SECONDS_PER_MINUTE)), unit: MINUTES_UNIT };
    case 'distance_time':
      return { value: (total / METERS_PER_KM).toFixed(1), unit: UNITS.distance_time };
  }
}

/**
 * 完了サマリーの主役数値を組み立てる。渡すのは**確定（✓）済みのセットだけ**。
 *
 * 重量種目が1つでもあれば「総重量」。無ければ「合計回数」「合計時間」「合計距離」の順に降りる。
 * 「足せる量が0だったら次へ」という判定にしているのは、重量欄を1度も埋めていない加重種目
 * （カスタム種目を重量×回数で作って回数だけ入れている等）で「総重量 0kg」を主役に据えないため。
 * グラフ側の resolveChartMeasurementType が同じ状況を reps 種目として描くのと揃えている。
 *
 * どの計測タイプでも足せる量が0だった場合はnull。「重量だけ入れて回数が空欄のまま✓を押した」
 * ように、確定セットはあるのに合計が立たない状態が実際に起こりうる（set-row.tsxは全欄が空でも
 * ✓を押せる）。そこで「総重量 0kg」を主役に据えると、やった内容が0扱いされたように見えるため、
 * 値なしとして呼び出し側に描き分けさせる
 */
export function computeSessionTotal(rows: SessionTotalRow[]): SessionTotal | null {
  const picked = TOTAL_ORDER.map((kind) => ({ kind, total: sumFor(kind, rows) })).find(
    (candidate) => candidate.total > 0,
  );
  if (!picked) return null;

  const { value, unit } = format(picked.kind, picked.total);
  return {
    // グラフの指標チップと同じ語（総重量／合計回数／合計時間／合計距離）を使い、
    // 画面ごとに呼び名が割れないようにする。TOTAL_ORDERの4つはいずれもMETRIC_LABELSに
    // totalを持つのでnullは返らないが、型の上では省略可能なので明示的に落とす
    label: progressMetricLabel(picked.kind, 'total') ?? '合計',
    value,
    unit,
  };
}
