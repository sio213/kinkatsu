import { chipStyles } from '@/components/exercises/chip-styles';
import { progressMetricLabel, type ProgressMetric } from '@/lib/exercises/progress';
import type { MeasurementType } from '@/lib/exercises/constants';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  /** resolveChartMeasurementType を通した「グラフ上の計測タイプ」。チップの文言がこれで決まる */
  measurementType: MeasurementType;
  /** availableProgressMetrics の結果。1件以下なら呼び出し側がこの列自体を出さないこと */
  metrics: ProgressMetric[];
  value: ProgressMetric;
  onChange: (metric: ProgressMetric) => void;
};

// チップ自体の高さは28px（文字の行高16 + 上下padding5 + 枠1）なので、上下に8pxずつ広げて
// タップ判定を44pt以上にする。デザイン案は「外側に透明な余白＋列に負のマージン」で同じことを
// していたが、React Nativeではレイアウトを歪めずに済むhitSlopで表現する（期間チップと同じ手法）
const HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

/**
 * 重量グラフの縦軸に出す指標を選ぶチップ（最大重量／総重量／推定1RM）。グラフの真下に置く。
 *
 * **等幅にしないこと（FIX-08）。** 真上にある期間チップは1行を4つで分け合う等幅だが、こちらは
 * 内容幅で左寄せに並べる。同じ見た目の丸ボタンが2段等幅で並ぶと、どちらが時間軸でどちらが
 * 指標なのかが区別できなくなるため、幅の付き方そのものを見分けの手がかりにしている。
 *
 * 見出し（「指標」などのラベル）も持たない。チップの文言自体が何を出しているかを言っている。
 */
export function MetricFilterChips({ measurementType, metrics, value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="グラフに出す指標">
      {metrics.map((metric) => {
        const isActive = metric === value;
        const label = progressMetricLabel(measurementType, metric);
        if (label == null) return null;
        return (
          <TouchableOpacity
            key={metric}
            style={[chipStyles.chip, chipStyles.chipMetric, isActive && chipStyles.chipActive]}
            onPress={() => onChange(metric)}
            hitSlop={HIT_SLOP}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={label}
          >
            <Text
              style={[chipStyles.chipText, chipStyles.chipTextSmall, isActive && chipStyles.chipTextActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 期間チップと同じ6pxの間隔。左寄せ（等幅にしない）ので flex は持たせない
  row: { flexDirection: 'row', gap: 6 },
});
