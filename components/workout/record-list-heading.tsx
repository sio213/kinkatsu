import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** 一覧の始まりを示すラベル（「記録一覧」「過去の記録」など） */
  label: string;
  /** 右端に出す総件数 */
  count: number;
  /** 右端の位置をカードの内側パディングに合わせたい場合などに渡す */
  style?: StyleProp<ViewStyle>;
};

/**
 * 記録の一覧の上に置く「見出し＋右端に全件数」の1行（デザイン案の採用案4-2）。
 *
 * 見出しがあることで一覧の始まりが明示され、件数は右端の補助情報として読み流せる。
 * 種目詳細の記録タブ・その種目の「過去の記録」画面・「過去の記録から読み込み」画面で共通。
 */
export function RecordListHeading({ label, count, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.count}>全{count}件</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 2 },
  label: { ...Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  count: { marginLeft: 'auto', ...Typography.caption, color: Colors.textMuted },
});
