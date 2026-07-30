import { DesignIcon } from '@/components/ui/design-icon';
import { BestBadge } from '@/components/workout/best-badge';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { ProgressPoint } from '@/lib/exercises/progress';
import {
  buildDetailSetRows,
  COLLAPSE_THRESHOLD,
  completedSets,
  hiddenSetCount,
  type DetailSetRow,
} from '@/lib/exercises/progress-detail';
import { compareToPrevious } from '@/lib/workout/comparison';
import { MEASUREMENT_COLUMNS, splitSetDisplay } from '@/lib/workout/set-format';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';

/** 列と列の間隔。セット番号↔値の間だけは numberCell の marginRight ぶん広い12px（デザイン案） */
const COLUMN_GAP = 6;

/** 「他N件を見る」の当たり判定。行の見た目は変えずに44pt相当まで広げる */
const EXPAND_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

type Props = {
  point: ProgressPoint;
  measurementType: MeasurementType;
  /**
   * 直前の記録。前回比の計算に使う。期間の絞り込みではなく全期間の系列で1つ前の点を渡すこと
   * （表示期間の外にあっても「直前の記録」であることに変わりはないため）。最初の記録ならnull
   */
  previousPoint: ProgressPoint | null;
  /**
   * この日が全期間の自己ベストか。trueのときだけ区切り線の直下にアンバーのバッジを出す。
   * 判定は過去の記録一覧のベストバッジと同じ findPersonalBest（同値タイは最初に到達した日）
   */
  isPersonalBest: boolean;
  /**
   * 選択中の指標の値を出す行（「総重量 1,645 kg」）。最大○○を選んでいるときはnull——
   * その値はセット行の太字と自己ベストバッジで既に読めるため出さない（FIX-13）
   */
  metricRow: { label: string; value: string; unit: string } | null;
  /** 見出し右端の > を押したとき。その日の記録編集画面へ遷移する */
  onPressOpen: (sessionId: number) => void;
};

/**
 * 1セルぶんの配線。styleは幅を配るセルのView、onLayoutはその中のText（自然幅を測るため、
 * minWidthを受けたView自身ではなく中身を測る）に渡す
 */
type ColumnCell = { style: { minWidth: number }; onLayout: (e: LayoutChangeEvent) => void };

/**
 * カード内で列幅を揃えるためのフック。
 *
 * デザイン案のセット行は内訳ブロック全体で一つのグリッド（列は max-content）だが、RNには
 * gridの max-content が無いため、各行のセルの自然幅をonLayoutで集めて最大値をminWidthに配る。
 * 幅は「いま表示している行」だけから決めるので、「他N件を見る」を畳めば元の幅に戻る。
 *
 * 測るのはセル内のTextなので、セル側にpaddingを持たせてはいけない。minWidthはborder-boxに効く
 * ため、最大幅の行だけpaddingぶん広くなって列が揃わなくなる（列間はmarginかgapで取ること）
 */
function useColumnWidth(keys: number[]): (key: number) => ColumnCell {
  const [widths, setWidths] = useState<Record<number, number>>({});
  const width = keys.reduce((max, key) => Math.max(max, widths[key] ?? 0), 0);

  return (key: number) => ({
    style: { minWidth: width },
    onLayout: (e: LayoutChangeEvent) => {
      const measured = e.nativeEvent.layout.width;
      setWidths((prev) => (prev[key] === measured ? prev : { ...prev, [key]: measured }));
    },
  });
}

/**
 * 1行ぶんの表示内容。✓未確定のセットは display を持たない（値があっても「確定した記録」では
 * ないので数値は出さず、その日にやり残しがあることだけを示す）
 */
type SetCell = { row: DetailSetRow; display: ReturnType<typeof splitSetDisplay> };

function buildSetCells(rows: DetailSetRow[], measurementType: MeasurementType): SetCell[] {
  return rows.map((row) => ({
    row,
    display:
      row.set.completedAt == null ? null : splitSetDisplay(MEASUREMENT_COLUMNS[measurementType], row.set),
  }));
}

/**
 * カード全体が1つの読み上げ単位（TouchableOpacityのaccessible）なので、セット行のTextは
 * 個別には読まれない。晴眼者が見ている内訳と同じ情報を親のラベルに畳んで渡す
 */
function describeSets(cells: SetCell[], comparisonLabel: string | null): string {
  return cells
    .map(({ row, display }) => {
      if (display == null) return `${row.position}セット目 未実施`;
      const value = [`${display.value}${display.unit}`, display.trailing].filter(Boolean).join(' ');
      // ★を廃止して視覚的な強弱だけにしたぶん、読み上げでは言葉で補う
      const best = row.isBest ? '、この日の最大' : '';
      const delta = row.isBest && comparisonLabel ? `、前回比 ${comparisonLabel}` : '';
      return `${row.position}セット目 ${value}${best}${delta}`;
    })
    .join('、');
}

function SetRow({
  row,
  display,
  comparisonLabel,
  comparisonIsIncrease,
  numberCell,
  valueCell,
}: SetCell & {
  comparisonLabel: string | null;
  comparisonIsIncrease: boolean;
  numberCell: ColumnCell;
  valueCell: ColumnCell;
}) {
  return (
    <View style={styles.setRow}>
      <View style={[styles.numberCell, numberCell.style]}>
        <Text style={styles.setNumber} onLayout={numberCell.onLayout}>
          {row.position}セット
        </Text>
      </View>

      {/* 未実施も値の列に右揃えで置く。列の規則を崩さず上の行の数字と右端が揃う（デザイン案 未-1）。
          列幅はそのカードで一番長い値が決めるので、未実施の日は「未実施」ぶんまで広がる */}
      <View style={[styles.valueCell, valueCell.style]}>
        {display == null ? (
          <Text style={styles.unfinished} onLayout={valueCell.onLayout}>
            未実施
          </Text>
        ) : (
          // その日の最大セットは記号を持たず、桁の揃った列の中で一番大きい太い数字で示す。
          // 旧形のアンバーの★はグラフの自己ベストの点と色も記号も同じで混同するため廃止した
          <Text style={row.isBest ? styles.bestValue : styles.setValue} onLayout={valueCell.onLayout}>
            {display.value}
          </Text>
        )}
      </View>

      {display != null && display.unit !== '' && <Text style={styles.unit}>{display.unit}</Text>}

      {display != null && (
        <View style={styles.trailingCell}>
          {display.trailing !== '' && <Text style={styles.trailing}>{display.trailing}</Text>}
          {/* 前回比はその日の最大セットの行に、回数の直後に置く。見出しには置かない
              （日付が長い月で1行に収まらなくなるため。デザイン案） */}
          {row.isBest && comparisonLabel && (
            <>
              <Text style={styles.comparisonLabel}>前回比</Text>
              <Text
                style={[
                  styles.comparisonValue,
                  { color: comparisonIsIncrease ? Colors.success : Colors.danger },
                ]}
              >
                {comparisonLabel}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * グラフで選択中の点の内訳カード。グラフの直下にインライン展開する。
 *
 * 吹き出しは指で隠れ、ボトムシートはグラフが見えなくなるためどちらも採らない（デザイン案）。
 * 閉じるボタンも持たない——初期状態で最新の点が選択済みなので、閉じられるとカードが空になり
 * 画面に穴が空いてしまう。
 *
 * カードの見た目は「過去の記録から読み込み」画面の HistoryEntryCard と揃えてある
 * （surfaceMuted ／ 1px border ／ 角丸10 ／ padding 12）。
 */
export function ExerciseRecordDetailCard({
  point,
  measurementType,
  previousPoint,
  isPersonalBest,
  metricRow,
  onPressOpen,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const dateLabel = formatSessionDateGroup(point.startedAt);
  const relativeLabel = formatRelativeDaysAgo(point.startedAt);

  // 前回比はベストのセット行に置く。値は既存のカレンダー選択日パネルと同じ compareToPrevious で
  // 求めるので、同じ記録に対して両画面が違う数字を出すことはない
  const comparison = useMemo(
    () =>
      previousPoint
        ? compareToPrevious(measurementType, completedSets(point), completedSets(previousPoint))
        : null,
    [measurementType, point, previousPoint],
  );

  const cells = useMemo(
    () => buildSetCells(buildDetailSetRows(point, expanded), measurementType),
    [point, expanded, measurementType],
  );
  const hidden = hiddenSetCount(point, false);
  const collapsible = point.sets.length >= COLLAPSE_THRESHOLD;

  const positions = cells.map((cell) => cell.row.position);
  const numberCell = useColumnWidth(positions);
  const valueCell = useColumnWidth(positions);

  const headerLabel = [dateLabel, relativeLabel, isPersonalBest && '自己ベスト']
    .filter(Boolean)
    .join('、');

  return (
    // 見出しの > だけでなくカード全体をタップ領域にする。「他N件を見る」は入れ子の
    // TouchableOpacityとして残るので、そちらを押したときは展開が優先される
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPressOpen(point.best.sessionId)}
      accessibilityRole="button"
      accessibilityLabel={
        `${headerLabel}の記録。${describeSets(cells, comparison?.label ?? null)}` +
        // 晴眼者に見えている指標の値が読み上げから落ちないよう、カードのラベルに畳んで足す
        (metricRow ? `、${metricRow.label} ${metricRow.value}${metricRow.unit}` : '')
      }
      accessibilityHint="タップするとこの日の記録を編集できます"
    >
      <View style={styles.header}>
        <Text style={styles.date}>{dateLabel}</Text>
        {relativeLabel && <Text style={styles.relative}>{relativeLabel}</Text>}
        <View style={styles.headerSpacer} />
        {/* 非テキストUIのコントラスト比3:1を満たすため textPlaceholder(slate400) ではなく
            textSecondary(slate600) を使う（デザイン案の指定） */}
        <DesignIcon name="chevron-right" size={IconSizes.cardChevron} color={Colors.textSecondary} />
      </View>

      <View style={styles.sets}>
        {/* アンバーは自己ベスト専用にする。区切り線の直下に独立した行で置き、見出しには入れない
            （日付が長い月で1行に収まらなくなるため。デザイン案） */}
        {isPersonalBest && (
          <View style={styles.personalBestRow}>
            <BestBadge label="自己ベスト" />
          </View>
        )}

        {cells.map((cell) => (
          <SetRow
            key={cell.row.position}
            row={cell.row}
            display={cell.display}
            comparisonLabel={comparison?.label ?? null}
            comparisonIsIncrease={(comparison?.delta ?? 0) > 0}
            numberCell={numberCell(cell.row.position)}
            valueCell={valueCell(cell.row.position)}
          />
        ))}

        {/* 「他N件を見る」は内訳ブロックの最終行に置く（セット行の続きであることを位置で示す）。
            デザイン案には展開だけしか無いが、一度開くと戻せないのは不便なので折りたたみも用意する */}
        {collapsible && (
          <TouchableOpacity
            style={styles.expandRow}
            // カード全体もタップ領域（記録編集へ遷移）なので、狙って外すと意図しない画面が開く。
            // 行自体は薄いままタップ判定だけ広げて誤爆を防ぐ
            hitSlop={EXPAND_HIT_SLOP}
            onPress={() => setExpanded(!expanded)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'セットの表示を折りたたむ' : `残り${hidden}件のセットを表示`}
          >
            <Text style={styles.expandText}>{expanded ? '折りたたむ' : `他${hidden}件を見る`}</Text>
            <DesignIcon name={expanded ? 'expand-less' : 'expand-more'} size={16} color={Colors.accent} />
          </TouchableOpacity>
        )}

        {/* 選択中の指標の値。カードの最後（「他N件を見る」の下）に置く。行の出入りで
            カードの高さは伸縮するが、動くのはこのカードから下だけなので許容する（FIX-13） */}
        {metricRow && (
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>{metricRow.label}</Text>
            {/* 単位はセット行と同じく値より一段弱く置く。値だけを太字で強調する */}
            <View style={styles.metricValueGroup}>
              <Text style={styles.metricValue}>{metricRow.value}</Text>
              <Text style={styles.unit}>{metricRow.unit}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { ...Typography.cardTitle, color: Colors.textPrimary },
  relative: { ...Typography.caption, color: Colors.textMuted },
  headerSpacer: { flex: 1 },

  // セット内訳は見出しから細い線で区切る
  sets: { borderTopWidth: 1, borderTopColor: Colors.surfaceSubtle, paddingTop: 5 },
  personalBestRow: { alignItems: 'flex-start', paddingTop: 1, paddingBottom: 4 },

  // 「セット番号 / 値 / 単位 / 回数・前回比」の4列。値は右揃えなので、桁数が違っても
  // 数値の右端・単位・×回数の左端が縦に揃う（列幅は useColumnWidth が行から決める）
  setRow: { flexDirection: 'row', alignItems: 'baseline', gap: COLUMN_GAP, paddingVertical: 2 },
  // 番号↔値の間だけ12px。paddingではなくmarginで取ること——minWidthはborder-boxに効くので、
  // paddingにすると測った最大幅の行だけ6px広くなって列が揃わなくなる
  numberCell: { alignItems: 'flex-end', marginRight: COLUMN_GAP },
  valueCell: { alignItems: 'flex-end' },
  trailingCell: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },

  setNumber: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
  setValue: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
  // その日の最大セットだけ一段大きい太字にして、他の行との強弱で「この日の最大」を示す。
  // letterSpacingはデザイン案が14pxの数字に指定している詰め幅（-.2px）
  bestValue: { ...Typography.metric, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  unit: { ...Typography.caption, color: Colors.textMuted },
  trailing: { ...Typography.caption, color: Colors.textMuted },
  unfinished: { ...Typography.caption, color: Colors.textSecondary },
  // 「前回比」ラベルと差分は BestBadge・カレンダー選択日パネルと同じ「バッジ的な強調テキスト」の役割
  comparisonLabel: { ...Typography.badge, fontWeight: '600', color: Colors.textSecondary, marginLeft: 8 },
  comparisonValue: { ...Typography.badge, marginLeft: 3 },

  // 指標の値行。セット内訳から細い線で区切る（見出し↔内訳と同じ引き方）
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceSubtle,
    marginTop: 5,
    paddingTop: 5,
  },
  // ラベルは切り替えチップと同じ語（総重量／推定1RM）を同じ大きさで置く
  metricLabel: { ...Typography.caption, color: Colors.textSecondary },
  metricValueGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  metricValue: {
    ...Typography.metric,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },

  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4 },
  expandText: { ...Typography.caption, fontWeight: '600', color: Colors.accent },
});
