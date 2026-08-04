import { Colors, Typography } from '@/constants/theme';
import type { SessionTotal } from '@/lib/workout/session-total';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  /** 所要時間。整形済みの文字列（「1時間12分」） */
  duration: string;
  /**
   * 主役数値。undefinedは集計がまだ解決していない状態、nullは解決済みだが合計が立たなかった状態。
   * 前者で「—」を描くと、開くたびに一瞬「値なし」が見えてから実際の総重量に切り替わってしまう
   */
  total: SessionTotal | null | undefined;
  /** そのセッションが今週何回目か。undefinedは未解決 */
  weekOrdinal: number | undefined;
};

/** 解決済みで値が無いときの表記。未解決のときは何も描かない（下のStatを参照） */
const NO_VALUE = '—';

function Stat({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <View
      style={styles.cell}
      // ラベルと数値を別々の要素として読ませると対応が付かないため、セル単位で1つにまとめる
      // （components/calendar/session-time-group-header.tsxと同じ考え方）
      accessible
      accessibilityLabel={value == null ? `${label} 読み込み中` : `${label} ${value}${unit ?? ''}`}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {value ?? ' '}
        {value != null && unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * 完了サマリーの数値3項目（デザイン案の確定形）。左から 時間 → 総重量 → 今週N回目 で、
 * 各項目はラベルを上・数値を下に置き、間を縦罫で仕切る。
 *
 * 2項目目の呼び名と単位はセッションの中身で変わる（重量種目が無ければ「合計回数」等）。
 * 判定は lib/workout/session-total.ts が持ち、このコンポーネントは受け取って描くだけ。
 *
 * 時間だけ単位（「時間」「分」）を小さく落とさないのはデザイン案通り。単位が数値の間に
 * 挟まる表記なので、他の2項目のように末尾だけ小さくすることができない
 */
export function SessionSummaryStats({ duration, total, weekOrdinal }: Props) {
  return (
    <View style={styles.row}>
      <Stat label="時間" value={duration} />
      <View style={styles.divider} />
      <Stat
        // 未解決の間もラベルの幅を確定させたいので、総重量を仮に出しておく。解決後に
        // セッションの中身次第で「合計回数」等へ差し替わる
        label={total?.label ?? '総重量'}
        value={total === undefined ? null : (total?.value ?? NO_VALUE)}
        unit={total?.unit}
      />
      <View style={styles.divider} />
      <Stat label="今週" value={weekOrdinal == null ? null : String(weekOrdinal)} unit="回目" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // 3項目を等幅にして、桁数が変わっても縦罫の位置が動かないようにする
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  label: { ...Typography.statLabel, color: Colors.textMuted },
  value: {
    ...Typography.cardTitle,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    // 桁が変わっても数字の幅が揺れないようにする（デザイン案のtabular-nums）
    fontVariant: ['tabular-nums'],
  },
  // 単位は数値より一段小さく落として、主役が数値のままになるようにする。
  // letterSpacingを打ち消すのは、親のTextから継承されるとデザイン案に無い詰まり方をするため
  unit: { ...Typography.statUnit, color: Colors.textMuted, letterSpacing: 0 },
  // 高さはデザイン案の確定形（V10）の指定値。共通CSSの.vrは26pxだが、このブロックだけ22px
  divider: { width: 1, height: 22, backgroundColor: Colors.border },
});
