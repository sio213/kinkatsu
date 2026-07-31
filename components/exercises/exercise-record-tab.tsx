import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { ExerciseProgressChartSample } from '@/components/exercises/exercise-progress-chart-sample';
import { ExerciseRecordDetailCard } from '@/components/exercises/exercise-record-detail-card';
import { MetricFilterChips } from '@/components/exercises/metric-filter-chips';
import { ExerciseRecordHistoryList } from '@/components/exercises/exercise-record-history-list';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import { DesignIcon } from '@/components/ui/design-icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import type { MeasurementType } from '@/lib/exercises/constants';
import { formatTickValue } from '@/lib/exercises/chart-scale';
import { ONE_REP_MAX_REP_LIMIT } from '@/lib/exercises/one-rep-max';
import {
  availableProgressMetrics,
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  findPersonalBest,
  progressMetricLabel,
  type ProgressMetric,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import { startWorkoutWithExercise } from '@/lib/workout/session';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  exerciseId: number;
  /** 「1回目を記録する」で進行中セッションの終了確認を出すときの文言に使う */
  exerciseName: string;
  measurementType: MeasurementType;
  /** 器具を同時に2つ扱う種目か（exercises.pairedWeights）。総重量を左右2つ分で数える */
  pairedWeights: boolean;
  /**
   * 種目詳細がタブ配下のStack（/exercises/[id]）から表示されているか。
   * 「すべての記録を見る」の遷移先をタブバーありのURLにするかどうかの判断に使う
   */
  insideTabBar: boolean;
};

/**
 * 種目詳細「記録」タブの中身。期間チップ → グラフ → 選択中の内訳カード → 過去の記録一覧、
 * の順に縦に並ぶ（デザイン案）。記録が0件のときは薄い見本グラフと「1回目を記録する」に
 * 差し替わり、1件のときは点1つだけを描いて履歴一覧を出さない（真上の内訳カードと同じ内容になるため）。
 */
export function ExerciseRecordTab({
  exerciseId,
  exerciseName,
  measurementType,
  pairedWeights,
  insideTabBar,
}: Props) {
  const push = useDebouncedPush();
  const { activeSession } = useWorkoutSessions();
  // 別のトレーニングが進行中なら確認を挟んでから開始する（ルーティン一覧のカードと同じ流儀）
  const startWithConfirm = useStartWithConfirm(
    activeSession,
    (sessionId) => push(`/workout/${sessionId}`),
    startWorkoutWithExercise,
  );
  const [period, setPeriod] = useState<ProgressPeriod>(DEFAULT_PROGRESS_PERIOD);
  const [requestedMetric, setRequestedMetric] = useState<ProgressMetric>('best');
  // metricはフックが「その種目で実際に選べる値」に丸めて返したもの。選択状態の表示にも使う
  const { series, bestSeries, recordDays, chartMeasurementType, metric, loaded, failed } = useExerciseProgress(
    exerciseId,
    measurementType,
    requestedMetric,
    pairedWeights,
  );

  // 種目によって選べる指標が変わる。1件しか無い（加重ホールド系）ならチップ列ごと出さない
  const metrics = useMemo(() => availableProgressMetrics(chartMeasurementType), [chartMeasurementType]);
  const metricLabel = progressMetricLabel(chartMeasurementType, metric);

  // 単位は全期間のデータで決めたものを使い、期間の切り替えで縦軸の単位が変わらないようにする
  const points = useMemo(
    () => filterProgressPoints(series.points, period),
    [series.points, period],
  );

  // 選択中の点は添字ではなく日付で覚える。期間を切り替えても同じ日を選び続けられるようにし、
  // 選んでいた日が期間外に出たときだけ最新の点へ戻す（初期表示も最新の点＝未選択のときの既定）
  const [selectedDateKey, setSelectedDateKey] = useState<number | null>(null);
  const selectedIndex = useMemo(() => {
    if (points.length === 0) return null;
    const index = selectedDateKey == null ? -1 : points.findIndex((p) => p.dateKey === selectedDateKey);
    return index >= 0 ? index : points.length - 1;
  }, [points, selectedDateKey]);

  const handleSelect = (index: number) => {
    setSelectedDateKey(points[index]?.dateKey ?? null);
  };

  const selectedPoint = selectedIndex == null ? null : points[selectedIndex];
  // 前回比は「直前の記録」との差なので、期間で絞ったpointsではなく全期間の系列から1つ前を探す
  // （表示期間の外にあっても直前の記録であることに変わりはない）。指標を切り替えても比較の中身は
  // セット同士なので、点の落ち方が指標で変わらないベスト系列から辿る
  const previousPoint = useMemo(() => {
    if (!selectedPoint) return null;
    const index = bestSeries.points.findIndex((p) => p.dateKey === selectedPoint.dateKey);
    return index > 0 ? bestSeries.points[index - 1] : null;
  }, [bestSeries.points, selectedPoint]);

  // グラフ上でハイライトする点。期間で絞ったpointsから求めると1ヶ月表示のたびにその月の最大が
  // ベスト扱いになり、内訳カード・過去の記録一覧のバッジと食い違うため、全期間の系列から求める。
  //
  // 最大○○（ベスト）指標のときだけ、これが「自己ベスト」——アンバーの点と★のチップになる。
  // 総重量・推定1RMでは単にその指標の最高値なので、色も★も持たせない（FIX-10）
  // グラフ下の注記。「太字の語＝説明」の形に揃え、当てはまるものを上から並べる
  const captions = useMemo(() => {
    const list: { lead: string; body: string }[] = [];
    // 点が1つも無いときは、指標の説明より「なぜ出ないか」を先に知りたい。同じ枠を使って差し替える
    const nothingToPlot = points.length === 0;
    if (metric === 'e1rm') {
      list.push({
        lead: '推定1RM',
        body: nothingToPlot
          ? `${ONE_REP_MAX_REP_LIMIT}回を超えるセットは誤差が大きいため、算出の対象外です`
          : `1回だけ挙げられる重量の目安です。重量×回数から計算しています（${ONE_REP_MAX_REP_LIMIT}回以下のセットのみ）`,
      });
    } else {
      if (nothingToPlot) list.push({ lead: 'この期間', body: '記録がありません' });
      // 内訳カードのセット行には「10kg × 10回」と片手の重量が出ているのに、合計だけ2倍になる。
      // 放置すると計算ミスに見えるので、数え方と具体例の両方を置く。
      //
      // 生のmeasurementTypeではなくchartMeasurementTypeで判定すること。重量を1度も入れていない
      // 種目は reps 扱いになり、総重量チップの中身が「合計回数」に変わる——回数は左右で2倍に
      // ならないので、そこにこの注記を出すと誤りになる。
      //
      // 点が1つも無い期間では出さない。2倍になった数字がどこにも見えていない場所で数え方だけ
      // 説明されても手がかりにならず、「この期間＝記録がありません」と並んで3行目まで積み上がる
      // （@designer指摘）。内訳カードが値行を出さない条件（FIX-13）と同じ考え方
      if (!nothingToPlot && metric === 'total' && pairedWeights && chartMeasurementType === 'weight_reps') {
        list.push({ lead: '総重量', body: '左右2つ分の合計です（10kg×10回なら200kg）' });
      }
    }
    // 加重種目を加重なしでやった日は点を置けない。一覧の件数とグラフの点数がズレる理由になるので、
    // 「データが抜けている」と誤解されないよう、消えたのではなく一覧に残っていることを伝える。
    //
    // 判定は**表示中の期間で**行う。全期間で比べると、自重の日が期間の外にしか無いとき——
    // 画面上はどこにも抜けが無いのに——注記だけが出てしまう
    const isWeightBased =
      chartMeasurementType === 'weight_reps' || chartMeasurementType === 'weight_time';
    const droppedInPeriod =
      filterProgressPoints(recordDays, period).length >
      filterProgressPoints(bestSeries.points, period).length;
    if (isWeightBased && droppedInPeriod) {
      // 「記録は一覧に残ります」は入れない。記録タブの一覧は直近3件しか出ないので、古い自重の日は
      // 案内した先に無い。理由（加重量が無い）を書く方が、0kgを入れても変わらないことの説明も兼ねる
      list.push({ lead: '自重の日', body: '加重量が無いので点を出しません' });
    }
    return list;
  }, [
    metric,
    chartMeasurementType,
    pairedWeights,
    recordDays,
    bestSeries.points,
    period,
    points.length,
  ]);

  const highlight = useMemo(() => findPersonalBest(series.points), [series.points]);
  // 内訳カードのバッジは選択中の指標に関係なく、実測の自己ベスト（ベスト系列の最高点）を指す
  const personalBest = useMemo(() => findPersonalBest(bestSeries.points), [bestSeries.points]);

  return (
    <View style={styles.container}>
      <PeriodFilterChips value={period} onChange={setPeriod} />

      {failed ? (
        <Text style={styles.placeholder}>記録を読み込めませんでした</Text>
      ) : !loaded ? (
        <Text style={styles.placeholder}>読み込み中</Text>
      ) : recordDays.length === 0 ? (
        // 記録0件。空白ではなく完成形を薄い見本で予告して、記録する動機にする（デザイン案）。
        // 判定に選択中の指標の系列を使わないこと——推定1RMは13回以上のセットしか無い日が落ちるので、
        // 記録が何十件あっても「まだ記録がありません」が出てしまう
        <>
          <ExerciseProgressChartSample />
          <View style={styles.emptyText}>
            <Text style={styles.emptyHeading}>記録の推移がここに出ます</Text>
            <Text style={styles.emptyBody}>まずは今日の1回を記録しましょう</Text>
          </View>
          <PrimaryButton
            style={styles.startButton}
            label="1回目を記録する"
            icon={<DesignIcon name="add" size={17} color={Colors.onAccent} />}
            onPress={() => startWithConfirm(exerciseId, exerciseName)}
          />
        </>
      ) : (
        // 描く点が無い場合もこの枝を通す。グラフは枠だけの状態で残り、チップ・注記・過去の記録は
        // そのまま出る——見本グラフに差し替えて一覧ごと消すと、記録はあるのに「何も無い画面」に
        // なってしまう（推定1RMは12回以下のセットが1つも無い日を落とすため、全期間でも0点になり得る）
        <>
          {/* グラフのSVGは上端に余白を持っているぶん、期間チップとの間が実際より空いて見える。
              gapは他の間隔（グラフ↔内訳カード等）にも効くので、ここだけ負のマージンで詰める */}
          <View style={styles.chartWrap}>
            <ExerciseProgressChart
              points={points}
              unit={series.unit}
              highlight={highlight}
              // アンバーと★は実測の自己ベスト専用。他の指標では色も記号も持たせない（FIX-10）
              highlightKind={metric === 'best' ? 'personal-best' : 'metric-max'}
              selectedIndex={selectedIndex}
              onSelect={handleSelect}
            />
          </View>

          {/* 切り替えチップはグラフの真下。キャプションはさらにその下に置く——間に挟むと、
              推定1RMを選ぶたびにチップの位置が動いてしまう（FIX-12） */}
          {metrics.length > 1 && (
            <MetricFilterChips
              measurementType={chartMeasurementType}
              metrics={metrics}
              value={metric}
              onChange={setRequestedMetric}
            />
          )}
          {captions.map((caption) => (
            <Text key={caption.lead} style={styles.caption}>
              <Text style={styles.captionLead}>{caption.lead}＝</Text>
              {caption.body}
            </Text>
          ))}

          {selectedPoint && (
            <ExerciseRecordDetailCard
              // 別の日を選んだら「他N件を見る」の展開状態を持ち越さず畳んだ状態から始める
              key={selectedPoint.dateKey}
              point={selectedPoint}
              // 系列を組んだのと同じ計測タイプを渡すこと。生のmeasurementTypeを渡すと、
              // 重量なしのweight_reps種目でセット行が全部「未実施」になる（主指標がnullのため）
              measurementType={chartMeasurementType}
              previousPoint={previousPoint}
              isPersonalBest={selectedPoint.dateKey === personalBest?.dateKey}
              // 最大○○のときは出さない——値はセット行の太字と自己ベストバッジで既に読めるため
              metricRow={
                metric === 'best' || metricLabel == null
                  ? null
                  : {
                      label: metricLabel,
                      value: formatTickValue(selectedPoint.value),
                      unit: series.unit.label,
                    }
              }
              onPressOpen={(sessionId) => push(`/workout/${sessionId}`)}
            />
          )}

          {/* 記録が1件だけのときは、真上の内訳カードと同じ内容が並ぶだけなので出さない。
              一覧は期間チップにも選択中の点にも連動させず、常に今日から見た直近3件 */}
          {recordDays.length > 1 && (
            <ExerciseRecordHistoryList
              points={recordDays}
              measurementType={chartMeasurementType}
              onPressRecord={(sessionId) => push(`/workout/${sessionId}`)}
              onPressSeeAll={() =>
                push(insideTabBar ? `/exercises/history/${exerciseId}` : `/exercise/history/${exerciseId}`)
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  // 期間チップとグラフの間だけ11px→6pxにする（グラフ自体の上余白があるぶんの取り消し）
  chartWrap: { marginTop: -5 },
  placeholder: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  // 推定1RMの注記。面・罫線・アイコンは持たない（?アイコン＋ポップオーバーは不採用）。
  // 幅290pxでは2行になる想定で、チップ列との間隔と合わせて内訳カードが45px下がる
  caption: { ...Typography.captionCompact, color: Colors.textSecondary },
  captionLead: { color: Colors.textPrimary, fontWeight: '700' },
  emptyText: { alignItems: 'center', gap: 5 },
  emptyHeading: { ...Typography.cardTitle, color: Colors.textPrimary },
  emptyBody: { ...Typography.footnote, color: Colors.textMuted },
  // 全幅のPrimaryButtonだと空状態の中で強すぎるので、文言の幅に合わせて中央に置く
  startButton: { alignSelf: 'center', paddingHorizontal: 20 },
});
