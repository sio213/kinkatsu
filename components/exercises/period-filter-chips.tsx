import { chipStyles } from '@/components/exercises/chip-styles';
import {
  PROGRESS_PERIODS,
  PROGRESS_PERIOD_LABELS,
  type ProgressPeriod,
} from '@/lib/exercises/progress';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  value: ProgressPeriod;
  onChange: (period: ProgressPeriod) => void;
};

// チップ自体の高さは26px（文字16 + 上下padding4 + 枠1）しかないため、上下に9pxずつ広げて
// タップ判定を44pt以上にする。デザイン案は「外側に透明な余白＋列に負のマージン」で同じことを
// していたが、React Nativeではレイアウトを歪めずに済むhitSlopで表現する
const HIT_SLOP = { top: 9, bottom: 9, left: 0, right: 0 };

/**
 * 重量グラフの表示期間を選ぶチップ（1ヶ月／3ヶ月／6ヶ月／全期間）。
 * カテゴリ絞り込みチップ（CategoryFilterChips）と同じ見た目の一回り小さい版で、
 * スタイルは chip-styles.ts の小サイズ差分を共有している。
 *
 * 将来、無料プランでは1ヶ月以外をロックする予定（デザイン案「有料プラン」）だが、
 * 課金基盤がまだ無いため現時点では全期間を開放している。
 */
export function PeriodFilterChips({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="グラフの表示期間">
      {PROGRESS_PERIODS.map((period) => {
        const isActive = period === value;
        const label = PROGRESS_PERIOD_LABELS[period];
        return (
          <TouchableOpacity
            key={period}
            style={[chipStyles.chip, chipStyles.chipSmall, isActive && chipStyles.chipActive]}
            onPress={() => onChange(period)}
            hitSlop={HIT_SLOP}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={label}
          >
            <Text style={[chipStyles.chipText, chipStyles.chipTextSmall, isActive && chipStyles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
});
