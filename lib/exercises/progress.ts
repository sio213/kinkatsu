import type { MeasurementType } from '@/lib/exercises/constants';
import {
  formatHistoryDuration,
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

const UNITS: Record<MeasurementType, ProgressUnit> = {
  weight_reps: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
  weight_time: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'duration' },
  reps: { label: '回', step: 5, minRange: 5, integerOnly: true, auxKind: 'sets' },
  time: SECONDS_UNIT,
  distance_time: { label: 'km', step: 2.5, minRange: 4, integerOnly: false, auxKind: 'none' },
};

// 縦軸の値をDBの保持単位から表示単位へ換算する係数。距離はm→km、時間は分表示のときだけ秒→分
function displayScale(measurementType: MeasurementType, unit: ProgressUnit): number {
  if (measurementType === 'distance_time') return 1 / 1000;
  if (unit === MINUTES_UNIT) return 1 / 60;
  return 1;
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
  /** その日のBest Set。必ず✓確定セットの中から選ばれる。内訳カードの星の位置にも使う */
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
): ProgressSeries {
  const byDay = new Map<number, { startedAt: number; sets: ProgressSet[] }>();
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

  // 主指標が全セットnull（値の無いセットだけを✓した）日は、点として置く値が無いので落とす
  const days: { dateKey: number; startedAt: number; best: ProgressSet; sets: ProgressSet[]; raw: number }[] = [];
  for (const [dateKey, day] of byDay) {
    const best = pickBestSet(measurementType, day.sets);
    if (!best) continue;
    days.push({ dateKey, startedAt: day.startedAt, best, sets: day.sets, raw: primaryMetric(measurementType, best)! });
  }
  days.sort((a, b) => a.dateKey - b.dateKey);

  const unit = resolveUnit(measurementType, days.map((d) => d.raw));
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

function resolveUnit(measurementType: MeasurementType, rawValues: number[]): ProgressUnit {
  if (measurementType !== 'time') return UNITS[measurementType];
  const max = rawValues.length > 0 ? Math.max(...rawValues) : 0;
  return max >= MINUTE_SWITCH_SECONDS ? MINUTES_UNIT : SECONDS_UNIT;
}

/**
 * 自己ベストの点の添字。同じ値が複数回あるときは最初に到達した回に付ける
 * （computePersonalBestIds が「後からタイしただけの日ではなく最初に達成した日」を選ぶのと同じ）。
 * グラフのアンバーの点と、過去の記録一覧のベストバッジで同じ判定を使う
 */
export function findBestIndex(points: ProgressPoint[]): number | null {
  if (points.length === 0) return null;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > points[best].value) best = i;
  }
  return best;
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
