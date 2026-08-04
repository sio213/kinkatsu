import { PAIRED_WEIGHT_SIDES, resolveMeasurementType, type MeasurementType } from '@/lib/exercises/constants';
import { progressMetricLabel } from '@/lib/exercises/progress';

/**
 * 完了サマリーの主役数値（デザイン案の2項目目）に必要な、セット1件分の値。
 * DBに依存しないよう、フック側（hooks/use-session-summary.ts）が引いた行をそのまま渡す形にする。
 *
 * ✓未確定の行も渡すこと。合計そのものは確定セットだけで出すが、**何の合計を出す画面なのか**
 * （総重量なのか合計回数なのか）は✓の有無に関係なく決まるべきで、✓が1つも無いセッションでも
 * 「総重量」に固定されないようにするため
 */
export type SessionTotalRow = {
  measurementType: string;
  pairedWeights: boolean;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** ✓で確定済みか。合計に足すのはこれがtrueの行だけ */
  completed: boolean;
};

export type SessionTotal = {
  /** 「総重量」「合計回数」など。lib/exercises/progress.ts のグラフ指標チップと同じ語を使う */
  label: string;
  /**
   * 表示用に整形済みの値（3桁区切り・小数の丸めまで済ませたもの）。確定セットから合計が
   * 立たなかった場合はnullで、呼び出し側が「—」等に描き分ける
   */
  value: string | null;
  /** 値の右に小さく添える単位（「kg」「回」など）。valueがnullなら添える先が無いのでnull */
  unit: string | null;
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

/** 足せる量があった最初の計測タイプ。1つも無ければnull */
function pickKind(rows: SessionTotalRow[]): { kind: TotalKind; total: number } | null {
  return (
    TOTAL_ORDER.map((kind) => ({ kind, total: sumFor(kind, rows) })).find((c) => c.total > 0) ?? null
  );
}

/**
 * 値を一切見ず、種目の計測タイプだけで決める最後の砦。ラベル専用。
 *
 * 合計が1つも立たない状態（欄が空のまま✓を押した／重量だけ入れて回数が空欄）でも、
 * 何を記録する画面だったかは種目から分かる。ここが無いと呼び出し側の既定値に落ちて、
 * 懸垂だけのセッションが「総重量」と名乗ってしまう
 */
function pickKindByType(rows: SessionTotalRow[]): TotalKind | null {
  return TOTAL_ORDER.find((kind) => rows.some((row) => classify(row.measurementType) === kind)) ?? null;
}

/**
 * 完了サマリーの主役数値を組み立てる。**✓未確定の行も含めて**渡すこと。
 *
 * 重量種目が1つでもあれば「総重量」。無ければ「合計回数」「合計時間」「合計距離」の順に降りる。
 * 「足せる量が0だったら次へ」という判定にしているのは、重量欄を1度も埋めていない加重種目
 * （カスタム種目を重量×回数で作って回数だけ入れている等）で「総重量 0kg」を主役に据えないため。
 * グラフ側の resolveChartMeasurementType が同じ状況を reps 種目として描くのと揃えている。
 *
 * ラベルと値で見る行が違う。値は確定セットだけの合計だが、ラベル（何の合計を出す画面か）は
 * ✓の有無に関係なく決まるべきで、**値を入れたが✓を1つも押さずに終了した**場合——記録として
 * 成立しないので合計は出せないが、画面自体には遷移する——でも、懸垂だけのセッションが
 * 「総重量」と名乗ってしまわないようにする（@ユーザー指摘、実機で確認）。
 *
 * valueがnullになるのは、確定セットから合計が立たない場合。「重量だけ入れて回数が空欄のまま
 * ✓を押した」ように、確定セットがあっても合計が0のことがある（set-row.tsxは全欄が空でも
 * ✓を押せる）。「総重量 0kg」はやった内容が0扱いされたように見えるため値なしに倒す。
 *
 * 戻り値自体がnullになるのは、セットが1行も無い等でラベルすら決められない場合だけ
 */
export function computeSessionTotal(rows: SessionTotalRow[]): SessionTotal | null {
  const completed = rows.filter((row) => row.completed);
  // ラベルの決め方は3段階。確定セットの合計で決まるならそれが正。決まらなければ✓未確定を
  // 含む全行の合計、それでも決まらなければ値を見ず種目の計測タイプだけで決める（値は出さない）
  const fromCompleted = pickKind(completed);
  const kind = fromCompleted?.kind ?? pickKind(rows)?.kind ?? pickKindByType(rows);
  if (kind == null) return null;

  const label =
    // グラフの指標チップと同じ語（総重量／合計回数／合計時間／合計距離）を使い、
    // 画面ごとに呼び名が割れないようにする。TOTAL_ORDERの4つはいずれもMETRIC_LABELSに
    // totalを持つのでnullは返らないが、型の上では省略可能なので明示的に落とす
    progressMetricLabel(kind, 'total') ?? '合計';

  if (!fromCompleted) return { label, value: null, unit: null };

  const { value, unit } = format(fromCompleted.kind, fromCompleted.total);
  return { label, value, unit };
}
