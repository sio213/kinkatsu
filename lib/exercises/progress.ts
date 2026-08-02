import { PAIRED_WEIGHT_SIDES, type MeasurementType } from '@/lib/exercises/constants';
import { estimateOneRepMax } from '@/lib/exercises/one-rep-max';
import {
  formatHistoryDuration,
  isEnteredWeight,
  pickRepresentativeSet,
  primaryMetric,
  secondaryMetric,
  type SetLike,
} from '@/lib/workout/set-format';

/**
 * 種目詳細「記録」タブの重量グラフ用のデータ整形。DBには触らず、フックが引いた行を
 * グラフが描ける形（1日1点の系列）に変換する純関数だけを置く。
 */

// ---------------------------------------------------------------------------
// 単位
// ---------------------------------------------------------------------------

/** ツールチップの2行目に添える補助情報の種類（デザイン案「要相談3」A-1〜A-6） */
export type ProgressAuxKind =
  // 重量種目は「その重量を何回挙げたか」
  | 'reps'
  // 加重ホールド系（weight_time）は「その重量で何秒保ったか」
  | 'duration'
  // 回数・時間種目はBest Set自体が回数/時間なので、代わりにその日のセット数
  | 'sets'
  // 距離・長時間の有酸素はセット数に意味が無いため出さない
  | 'none';

export type ProgressUnit = {
  /** 縦軸ラベル・ツールチップに出す単位表記 */
  label: string;
  /** 目盛りの基本の刻み。線が増えすぎる場合はスケール側で1段上げる */
  step: number;
  /** 確保する最小レンジ。わずかな差が急成長のように描かれるのを防ぐ */
  minRange: number;
  /**
   * 目盛りに小数を許さない単位か。回数・秒・分は「2.5回」のような目盛りが意味を成さないため、
   * 刻みの候補を整数だけにする（重量・距離は2.5kg／2.5kmを使う）
   */
  integerOnly: boolean;
  auxKind: ProgressAuxKind;
};

// 「時間」種目だけは、プランク（数十秒）とバイク（数十分）が同じ計測タイプに同居する。
// 秒のまま描くと後者が1800のような桁になり目盛りが読めないため、その種目の最大値が
// この閾値以上なら分に切り替える（デザイン案「秒では桁が大きくなりすぎる種目は分で持つ」）
const MINUTE_SWITCH_SECONDS = 600;

const SECONDS_UNIT: ProgressUnit = { label: '秒', step: 10, minRange: 20, integerOnly: true, auxKind: 'sets' };
const MINUTES_UNIT: ProgressUnit = { label: '分', step: 10, minRange: 10, integerOnly: true, auxKind: 'none' };
// 合計側は1日ぶんを足した値なので桁が一段上がる。刻みと最小レンジもそれに合わせる。
// 補助情報を持たないのは、合計が「その日全体」の値で、特定のセットに紐づく情報
// （「×8」「×3セット」）を添える理由が無いため（FIX-14）
const TOTAL_SECONDS_UNIT: ProgressUnit = { label: '秒', step: 30, minRange: 60, integerOnly: true, auxKind: 'none' };
const TOTAL_MINUTES_UNIT: ProgressUnit = { label: '分', step: 10, minRange: 10, integerOnly: true, auxKind: 'none' };

const BEST_UNITS: Record<MeasurementType, ProgressUnit> = {
  weight_reps: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
  weight_time: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'duration' },
  reps: { label: '回', step: 5, minRange: 5, integerOnly: true, auxKind: 'sets' },
  time: SECONDS_UNIT,
  distance_time: { label: 'km', step: 2.5, minRange: 4, integerOnly: false, auxKind: 'none' },
};

/**
 * 合計指標の単位。weight_reps だけ Σ(重量×回数) で桁が跳ね上がる（1,500〜12,500kg）ため、
 * 刻みの基準を100kgに置く。他は主指標をそのまま足すだけなので、ベスト側より一段粗い程度。
 * weight_time は足せる量が無いので持たない（この計測タイプでは合計指標を出さない）
 */
const TOTAL_UNITS: Partial<Record<MeasurementType, ProgressUnit>> = {
  weight_reps: { label: 'kg', step: 100, minRange: 200, integerOnly: false, auxKind: 'none' },
  reps: { label: '回', step: 20, minRange: 20, integerOnly: true, auxKind: 'none' },
  time: TOTAL_SECONDS_UNIT,
  distance_time: { label: 'km', step: 2.5, minRange: 4, integerOnly: false, auxKind: 'none' },
};

/** 推定1RMは重量×回数の種目でしか定義できない。値域はベスト重量と同程度なので刻みも揃える */
const E1RM_UNIT: ProgressUnit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'none' };

// 縦軸の値をDBの保持単位から表示単位へ換算する係数。距離はm→km、時間は分表示のときだけ秒→分
function displayScale(measurementType: MeasurementType, unit: ProgressUnit): number {
  if (measurementType === 'distance_time') return 1 / 1000;
  if (unit === MINUTES_UNIT || unit === TOTAL_MINUTES_UNIT) return 1 / 60;
  return 1;
}

// ---------------------------------------------------------------------------
// 指標
// ---------------------------------------------------------------------------

export const PROGRESS_METRICS = ['best', 'total', 'e1rm'] as const;
/** グラフの縦軸に何を出すか。'best'＝その日の最強セット、'total'＝その日の合計、'e1rm'＝推定1RM */
export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/**
 * 指標チップの文言。計測タイプごとに語が変わる（合計は「総重量／合計回数／合計時間／合計距離」）。
 * ここに載っていない組み合わせはその種目で選べない指標で、チップにも出さない。
 *
 * 「1RM」ではなく必ず「推定1RM」と書くこと。1RM という略語自体が初心者に通じない上、
 * 「推定」を落とすと実測値と誤解され、その重量に挑戦して怪我をしかねない（FIX-09）。
 */
const METRIC_LABELS: Record<MeasurementType, Partial<Record<ProgressMetric, string>>> = {
  weight_reps: { best: '最大重量', total: '総重量', e1rm: '推定1RM' },
  // 加重ホールドは合計も推定1RMも定義できない。1つしか無いのでチップ列自体が出ない
  weight_time: { best: '最大重量' },
  reps: { best: '最大回数', total: '合計回数' },
  time: { best: '最大時間', total: '合計時間' },
  distance_time: { best: '最大距離', total: '合計距離' },
};

/** 指標チップに出す文言。選べない組み合わせならnull */
export function progressMetricLabel(
  measurementType: MeasurementType,
  metric: ProgressMetric,
): string | null {
  return METRIC_LABELS[measurementType][metric] ?? null;
}

/**
 * その種目で選べる指標。並び順は PROGRESS_METRICS（最大○○ → 合計 → 推定1RM）で固定。
 *
 * 返り値が1件のときは切り替えの余地が無いので、呼び出し側はチップ列ごと出さないこと
 * （空の列を残さない。加重ホールド系がこれに当たる）。
 *
 * 渡すのは resolveChartMeasurementType を通した「グラフ上の計測タイプ」であること。
 * 重量を1度も記録していない加重種目は reps 種目として扱うので、チップも「最大回数／合計回数」になる。
 */
export function availableProgressMetrics(measurementType: MeasurementType): ProgressMetric[] {
  return PROGRESS_METRICS.filter((metric) => METRIC_LABELS[measurementType][metric] != null);
}

/**
 * 重量として有効な値か。`0` を弾くのが要点。
 *
 * 加重種目で「加重なしの日」を記録するとき、重量欄を空にする人と `0` と打つ人がいる。意図は
 * 同じなのに、null は主指標が無いものとして点が落ち、`0` は有効値として通って 0kg の点が立つ
 * ——書き方の違いだけで縦軸のスケールが潰れてしまう。両者を同じ「未入力」として扱う。
 */
function hasWeight(set: SetLike): boolean {
  return isEnteredWeight(set.weight);
}

/**
 * グラフ上でその種目を何の計測タイプとして扱うか。
 *
 * weight_reps なのに✓確定セットの重量が1つも無い種目（加重チンニングをずっと自重でやっている、
 * カスタム種目を weight_reps で作って回数だけ入れている）は、主指標が全セットnullになるため
 * **全ての日が落ちてグラフが空になる**。記録が何十件あっても「まだ記録がありません／1回目を
 * 記録する」が出てしまうので、実質 reps 種目として扱い、最高回数・合計回数を描く。
 *
 * 判定は種目単位・全期間のデータで1回だけ行う。重量が1つでも入った時点で重量種目に戻るため、
 * 初めて加重した日に縦軸が「回」から「kg」に変わり、過去の自重日の点は落ちる。同じ縦軸に
 * 「回」と「kg」は混ぜられないので回避できないが、起きるのは1回きり。
 */
export function resolveChartMeasurementType(
  measurementType: MeasurementType,
  rows: ProgressSetRow[],
): MeasurementType {
  if (measurementType !== 'weight_reps') return measurementType;
  return rows.some((row) => row.completedAt != null && hasWeight(row)) ? 'weight_reps' : 'reps';
}

// ---------------------------------------------------------------------------
// 系列
// ---------------------------------------------------------------------------

/**
 * フックが引いてくる1行（種目で絞り込み済み）。✓未確定のセットも含まれる——グラフの値には
 * 使わないが、内訳カードでは「未実施」として並べるため（デザイン案の進行中セッションの表示）
 */
export type ProgressSetRow = SetLike & {
  sessionId: number;
  workoutSessionExerciseId: number;
  startedAt: number;
  setNumber: number;
  completedAt: number | null;
};

export type ProgressSet = SetLike & {
  sessionId: number;
  workoutSessionExerciseId: number;
  setNumber: number;
  /** nullなら✓未確定。グラフの値・自己ベスト・補助情報の集計からは除く */
  completedAt: number | null;
};

export function isCompleted(set: ProgressSet): boolean {
  return set.completedAt != null;
}

export type ProgressPoint = {
  /** その日の0時0分（端末のローカル時刻）のepoch ms。X軸の位置に使う */
  dateKey: number;
  /** 内訳カードの見出し（「7月23日（木）」＋相対日付）に使う、その日の最初のセッションの開始時刻 */
  startedAt: number;
  /** 縦軸の値。単位は ProgressSeries.unit に従い、換算済み */
  value: number;
  /**
   * その日のBest Set。必ず✓確定セットの中から選ばれる。内訳カードの星の位置にも使う。
   *
   * **指標を切り替えても意味を変えないこと。** `best.sessionId` は内訳カードの遷移先・
   * 折りたたみ窓の中心（buildDetailSetRows）・ExerciseRecordCard が使っており、
   * 指標で動くと同じ日を選んでいるのに飛び先が変わるなど挙動が読めなくなる。
   * 指標ごとの「値を出したセット」は metricSet の方に持つ
   */
  best: ProgressSet;
  /**
   * その日に記録した全セット。同じ日に同じ種目を複数カードでやっていれば連結される。
   * ✓未確定のセットも含む（内訳カードで「未実施」として並べるため）
   */
  sets: ProgressSet[];
};

export type ProgressSeries = {
  unit: ProgressUnit;
  /** 古い順。X軸が実日付なので間隔は不均等になる */
  points: ProgressPoint[];
};

/**
 * ツールチップの2行目に添える補助情報（「×8」「×3セット」など）。単位ごとに意味が変わる。
 * 距離・長時間の有酸素はセット数に意味が無いためnull（何も出さない）。
 */
export function formatProgressAux(unit: ProgressUnit, point: ProgressPoint): string | null {
  switch (unit.auxKind) {
    case 'reps':
      return point.best.reps == null ? null : `×${point.best.reps}`;
    case 'duration':
      return point.best.durationSeconds == null ? null : `×${formatHistoryDuration(point.best.durationSeconds)}`;
    case 'sets':
      // 回数・時間種目はBest Set自体が回数/時間なので、代わりにその日のセット数を出す。
      // 進行中セッションの✓未確定セットは「まだやっていない」ので数えない
      return `×${point.sets.filter(isCompleted).length}セット`;
    case 'none':
      return null;
  }
}

/** その日の0時0分（ローカル）のepoch ms */
export function toDayKey(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * ✓確定セットの行を「1日1点」の系列にまとめる。
 *
 * 1点＝1日にしているのは、X軸が実日付である以上、同じ日の記録が複数あっても横位置が
 * 重なってしまい線が縦に折り返して見えるため。同じ日に同じ種目をウォームアップ用・本番用の
 * 2カードに分けて記録していても、その日の「一番強かったセット」が点になるのが自然という判断
 * （自己ベストの定義 computePersonalBestIds と同じ考え方）。
 *
 * rowsは開始時刻の昇順で渡すこと（呼び出し側のクエリでorderBy済み）。
 */
export function buildProgressSeries(
  measurementType: MeasurementType,
  rows: ProgressSetRow[],
  metric: ProgressMetric = 'best',
  /** 器具を同時に2つ扱う種目か（exercises.pairedWeights）。総重量だけがこれで2倍になる */
  pairedWeights = false,
): ProgressSeries {
  const byDay = groupByDay(rows);

  // 値の置けない日は落とす。落ちる条件は指標ごとに違う——主指標が全セットnullの日（値の無い
  // セットだけを✓した）はどの指標でも落ちるが、推定1RMは13回以上のセットしか無い日も落ちる。
  // つまり series.points.length は指標で変わるので、空状態・履歴一覧の判定にこの系列を使わないこと
  type Day = { dateKey: number; startedAt: number; best: ProgressSet; sets: ProgressSet[]; raw: number };
  const days: Day[] = [];
  for (const [dateKey, day] of byDay) {
    const best = pickBestSet(measurementType, day.sets);
    if (!best) continue;
    const raw = computeMetricValue(measurementType, metric, best, day.sets, pairedWeights);
    if (raw == null) continue;
    days.push({ dateKey, startedAt: day.startedAt, best, sets: day.sets, raw });
  }
  days.sort((a, b) => a.dateKey - b.dateKey);

  const unit = resolveUnit(measurementType, metric, days.map((d) => d.raw));
  const scale = displayScale(measurementType, unit);

  return {
    unit,
    points: days.map((d) => ({
      dateKey: d.dateKey,
      startedAt: d.startedAt,
      // 秒→分・m→kmの換算で 3.4000000000000004 のような誤差が出るため、小数第2位で丸める
      value: Math.round(d.raw * scale * 100) / 100,
      best: d.best,
      sets: d.sets,
    })),
  };
}

type DayGroup = { startedAt: number; sets: ProgressSet[] };

/** 行を日ごとにまとめる。同じ日に複数セッション・複数カードがあれば1つに連結される */
function groupByDay(rows: ProgressSetRow[]): Map<number, DayGroup> {
  const byDay = new Map<number, DayGroup>();
  for (const row of rows) {
    const dayKey = toDayKey(row.startedAt);
    const day = byDay.get(dayKey);
    const set: ProgressSet = {
      sessionId: row.sessionId,
      workoutSessionExerciseId: row.workoutSessionExerciseId,
      setNumber: row.setNumber,
      weight: row.weight,
      reps: row.reps,
      durationSeconds: row.durationSeconds,
      distanceMeters: row.distanceMeters,
      completedAt: row.completedAt,
    };
    if (day) {
      day.sets.push(set);
      // rowsは昇順なので、既にある値の方が必ず早い。startedAtは更新しない
    } else {
      byDay.set(dayKey, { startedAt: row.startedAt, sets: [set] });
    }
  }
  return byDay;
}

/**
 * 過去の記録一覧・「すべての記録」画面に並べる日。**グラフの系列と違い、値が置けない日も落とさない。**
 *
 * 加重種目を加重なしでやった日は、主指標（重量）が無いのでグラフには点を置けない。それは
 * 妥当だが、同じ理由で記録一覧からも消えると「記録できていなかったのでは」と不安になる
 * （記録編集画面にだけ残っている状態になる）。一覧はやった事実を並べる場所なので、
 * 加重の有無に関わらず出す。
 *
 * 一覧のカードは日付・セット・遷移先のsessionIdしか読まないので、値が0でも表示は成立する。
 */
export function buildRecordDays(
  measurementType: MeasurementType,
  rows: ProgressSetRow[],
): ProgressPoint[] {
  const days: ProgressPoint[] = [];
  for (const [dateKey, day] of groupByDay(rows)) {
    const completed = day.sets.filter(isCompleted);
    if (completed.length === 0) continue;
    // 代表セットは遷移先のsessionIdを持つためだけに要る。重量のある日は最強のセット、
    // 自重だけの日は主指標を問わず選び、それも決まらなければ最初の✓確定セットに落とす
    const best =
      pickBestSet(measurementType, day.sets) ??
      pickRepresentativeSet(measurementType, completed) ??
      completed[0];
    days.push({
      dateKey,
      startedAt: day.startedAt,
      // 一覧は値を読まない。自己ベストの判定はグラフ側の系列で行うので0で構わない
      value: primaryValue(measurementType, best) ?? 0,
      best,
      sets: day.sets,
    });
  }
  return days.sort((a, b) => a.dateKey - b.dateKey);
}

/**
 * その日の値。置ける値が無ければnull（＝その日は点にしない）。
 *
 * 合計は「その日の全セット」を足す。同じ日に複数セッションがあれば byDay で既に連結されて
 * いるので合算されるし、ウォームアップ用に分けたカードも区別せず足す（スキーマに warmup の
 * 区別が無く、別カードに分ける運用でしか表現されていないため）。✓確定セットのみが対象。
 */
function computeMetricValue(
  measurementType: MeasurementType,
  metric: ProgressMetric,
  best: ProgressSet,
  sets: ProgressSet[],
  pairedWeights: boolean,
): number | null {
  // 最大重量・推定1RMは左右2つ分にしない。「今日は何kgのダンベルを持ったか」「1回なら何kgか」
  // という問いへの答えは片方の重量そのものであり、2倍にするとダンベルの刻印とも、内訳カードの
  // セット行に出る値とも食い違う。合計だけが「動かした総量」を問うので2倍になる
  if (metric === 'best') return primaryValue(measurementType, best);

  if (metric === 'e1rm') {
    let top: number | null = null;
    for (const set of sets.filter(isCompleted)) {
      const estimate = estimateOneRepMax(set.weight, set.reps);
      if (estimate == null) continue;
      if (top == null || estimate > top) top = estimate;
    }
    return top;
  }

  let total = 0;
  let counted = 0;
  for (const set of sets.filter(isCompleted)) {
    const contribution = totalContribution(measurementType, set, pairedWeights);
    if (contribution == null) continue;
    total += contribution;
    counted++;
  }
  return counted === 0 ? null : total;
}

/**
 * 合計に足す1セットぶんの量。足せる量が無い（未入力・そもそも定義できない）ならnull。
 *
 * pairedWeights の種目（ダンベルベンチプレス等、器具を同時に2つ扱う）は左右2つ分で数える。
 * 入力する重量はダンベル片方の刻印どおり片手ぶんなので、そのまま足すと実際に動かした量の
 * 半分になり、バーベル種目と並べたときに不当に低く見える（2026-07-31 決定）。
 */
function totalContribution(
  measurementType: MeasurementType,
  set: ProgressSet,
  pairedWeights: boolean,
): number | null {
  // 重量×回数だけは主指標（＝重量）の合計では意味を成さないので専用の式にする。
  // 他の計測タイプは主指標をそのまま足したものが合計回数・合計時間・合計距離になる
  if (measurementType === 'weight_reps') {
    if (!hasWeight(set) || set.reps == null) return null;
    return set.weight! * set.reps * (pairedWeights ? PAIRED_WEIGHT_SIDES : 1);
  }
  // 加重ホールドは足せる量が無い（重量を足しても無意味、時間を足すと加重量が消える）
  if (measurementType === 'weight_time') return null;
  return primaryValue(measurementType, set);
}

// pickRepresentativeSetと同じ判定（主指標が最大、同値なら副指標が大きい方）だが、
// 同値のセットが複数あるときに「先にやった方」を採るところだけ違う。自己ベストの
// 「最初に到達した回を採る」（computePersonalBestIds）と揃えるため。
// ✓未確定のセットは「まだ確認していない値」なので対象外。後で外されると点が下がって
// 「減った」ように見えてしまう
function pickBestSet(measurementType: MeasurementType, sets: ProgressSet[]): ProgressSet | null {
  let best: ProgressSet | null = null;
  let bestPrimary = -Infinity;
  let bestSecondary = -Infinity;
  for (const s of sets.filter(isCompleted)) {
    const primary = primaryValue(measurementType, s);
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

/**
 * 主指標の値。重量の種目だけ `0` と null を同じ「未入力」として扱うのが primaryMetric との違い
 * （hasWeight のコメント参照）。ベストの選定にも合計にもこちらを通す
 */
function primaryValue(measurementType: MeasurementType, set: SetLike): number | null {
  if ((measurementType === 'weight_reps' || measurementType === 'weight_time') && !hasWeight(set)) {
    return null;
  }
  return primaryMetric(measurementType, set);
}

function resolveUnit(
  measurementType: MeasurementType,
  metric: ProgressMetric,
  rawValues: number[],
): ProgressUnit {
  if (metric === 'e1rm') return E1RM_UNIT;

  const max = rawValues.length > 0 ? Math.max(...rawValues) : 0;
  if (metric === 'total') {
    // 合計は1日ぶんを足した値なので、秒のままだと桁が大きくなりやすい。分への切り替えは
    // ベスト側と同じ閾値で判定する（合計時間が10分以上なら分）
    if (measurementType === 'time') {
      return max >= MINUTE_SWITCH_SECONDS ? TOTAL_MINUTES_UNIT : TOTAL_SECONDS_UNIT;
    }
    // 合計を持たない計測タイプはそもそも選べない（availableProgressMetrics が返さない）
    return TOTAL_UNITS[measurementType] ?? BEST_UNITS[measurementType];
  }

  if (measurementType !== 'time') return BEST_UNITS[measurementType];
  return max >= MINUTE_SWITCH_SECONDS ? MINUTES_UNIT : SECONDS_UNIT;
}

/**
 * 自己ベストの点の添字。同じ値が複数回あるときは最初に到達した回に付ける
 * （computePersonalBestIds が「後からタイしただけの日ではなく最初に達成した日」を選ぶのと同じ）。
 * グラフのアンバーの点と、過去の記録一覧のベストバッジで同じ判定を使う
 */
function findBestIndex(points: ProgressPoint[]): number | null {
  if (points.length === 0) return null;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > points[best].value) best = i;
  }
  return best;
}

/**
 * 自己ベストの点そのもの。**期間で絞る前の全期間の系列を渡すこと**。
 *
 * 「自己ベスト」は期間チップで意味が変わってはいけない値なので、絞り込み後の配列を渡さない
 * ことを名前で強制するため、添字を返す findBestIndex は非exportにしてこちらを唯一の入口にしている
 * （グラフのアンバーの点・ベストチップ、内訳カードのバッジ、過去の記録一覧のバッジが全てこれを使う）。
 */
export function findPersonalBest(allPoints: ProgressPoint[]): ProgressPoint | null {
  const index = findBestIndex(allPoints);
  return index == null ? null : allPoints[index];
}

// ---------------------------------------------------------------------------
// 期間
// ---------------------------------------------------------------------------

export const PROGRESS_PERIODS = ['1m', '3m', '6m', 'all'] as const;
export type ProgressPeriod = (typeof PROGRESS_PERIODS)[number];

export const PROGRESS_PERIOD_LABELS: Record<ProgressPeriod, string> = {
  '1m': '1ヶ月',
  '3m': '3ヶ月',
  '6m': '6ヶ月',
  all: '全期間',
};

/**
 * 既定は3ヶ月。1ヶ月では週2回ペースだと8点しか並ばず「推移」として読めず、6ヶ月以上だと
 * マーカーが消えて線だけになるため、その中間を初期値にする（デザイン案の確定事項）。
 */
export const DEFAULT_PROGRESS_PERIOD: ProgressPeriod = '3m';

const PERIOD_MONTHS: Record<Exclude<ProgressPeriod, 'all'>, number> = { '1m': 1, '3m': 3, '6m': 6 };

/**
 * 期間の起点。「3ヶ月」は90日ではなく実カレンダーで3ヶ月前の同日にする
 * （月末起点だと存在しない日になるためDateの繰り上がりに任せる。1点の差で
 * グラフが変わるだけなので、通知スケジューラのような厳密な月境界計算は要らない）
 */
export function progressPeriodStart(period: ProgressPeriod, now: number): number | null {
  if (period === 'all') return null;
  const d = new Date(now);
  d.setMonth(d.getMonth() - PERIOD_MONTHS[period]);
  return toDayKey(d.getTime());
}

export type ProgressLeadIn = {
  /** 表示期間の直前にある最新の点。線の始点にだけ使い、マーカーもツールチップも持たない */
  point: ProgressPoint;
  /** 表示期間の始まり（＝X軸の左端に置く日） */
  windowStart: number;
};

/**
 * 表示期間の1つ前の記録。「1ヶ月」表示で期間内の記録が1件しか無くても、線が期間の外から
 * 伸びてきてその点に繋がるようにするためのもの（期間外なので点そのものは描かない）。
 *
 * 無料プランは直近1ヶ月しか見られないため、「期間内1点＝線が1本も引かれない」は無料ユーザーの
 * 標準的な画面になる（グラフは種目ごとなので、通っていても月1〜2回しかやらない種目では普通に
 * 起きる）。そこで推移が何も読めないと、期間を広げる価値も伝わらない。自己ベストが表示期間の
 * 外にあってもチップで値を出し続けているのと同じ考え方（マネタイズ設計 2026-07-30）。
 *
 * 全期間表示では常にnull（期間の外が存在しない）。全期間で1件しか無い場合も同じくnullで、
 * このときは点1つだけが描かれる。
 *
 * pointsは古い順（buildProgressSeriesの出力）であること。
 */
export function findLeadIn(
  points: ProgressPoint[],
  period: ProgressPeriod,
  now: number = Date.now(),
): ProgressLeadIn | null {
  const windowStart = progressPeriodStart(period, now);
  if (windowStart == null) return null;
  let point: ProgressPoint | null = null;
  for (const p of points) {
    if (p.dateKey >= windowStart) break;
    point = p;
  }
  return point == null ? null : { point, windowStart };
}

/** 期間チップの選択に応じて系列を絞り込む。単位は全期間のデータで決めた値をそのまま使う */
export function filterProgressPoints(
  points: ProgressPoint[],
  period: ProgressPeriod,
  now: number = Date.now(),
): ProgressPoint[] {
  const start = progressPeriodStart(period, now);
  if (start == null) return points;
  return points.filter((p) => p.dateKey >= start);
}
