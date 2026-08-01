import { Radio } from '@/components/ui/radio';
import { Colors, Typography } from '@/constants/theme';
import {
  MEASUREMENT_TYPE_LABELS,
  MEASUREMENT_TYPES,
  type MeasurementType,
} from '@/lib/exercises/constants';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  value: MeasurementType;
  onChange: (value: MeasurementType) => void;
};

// 「重量(kg)・回数 — ベンチプレス、ダンベルカール」。前半はセット入力欄の列ラベルそのもの
// （MEASUREMENT_COLUMNS）から作る。ここで文字列を書き写すと、単位表記を変えたときに
// 「入力欄はkgなのに種目フォームの説明だけ古い」というズレが起きる
function describeMeasurementType(type: MeasurementType): string {
  const columns = MEASUREMENT_COLUMNS[type].map((c) => c.label).join('・');
  return `${columns} — ${MEASUREMENT_TYPE_LABELS[type].examples}`;
}

/**
 * カスタム種目フォームの「記録する項目」（計測タイプ）を選ぶ5択リスト。
 *
 * カテゴリのようなチップ列にせず、1枚の囲みカードに縦5行で並べる。理由は2つ——
 * すぐ上にカテゴリのチップが複数段あるため、その直下にもう1段チップ群を置くとどこまでが
 * 1つの項目か分からなくなること。そして各行が「出る入力欄 — 代表種目」の2行目を持つため、
 * チップの文字幅には収まらないこと（この2行目が今回の設計の要点なので削らないこと）。
 *
 * 5件と少なく、選択が記録画面の入力欄そのものを変える重い項目なので、折りたたみ・
 * 横スクロールにはせず常に5択すべてを見せる。
 */
export function MeasurementTypeField({ value, onChange }: Props) {
  return (
    // accessibilityLabelは付けない。直上のFormLabel（SectionHeadingがheaderとして
    // 「記録する項目」を読む）と同じ文言になり、VoiceOverで2回読まれる。ラベルを持たない
    // 期間チップ・指標チップとはここが違う
    <View style={styles.card} accessibilityRole="radiogroup">
      {MEASUREMENT_TYPES.map((type, index) => {
        const isActive = type === value;
        const { label } = MEASUREMENT_TYPE_LABELS[type];
        const description = describeMeasurementType(type);
        return (
          <TouchableOpacity
            key={type}
            style={[styles.row, index > 0 && styles.rowDivider, isActive && styles.rowActive]}
            onPress={() => onChange(type)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            // VoiceOverでは選択肢名だけだと「重量×時間」と「距離×時間」を聞き分けにくいため、
            // 画面と同じく入力欄・代表種目まで読み上げる
            accessibilityLabel={`${label}。${description}`}
          >
            {/* ラジオは2行のテキストの1行目に揃える（行全体の中央だと2行目に引っ張られて下がる） */}
            <View style={styles.radio}>
              <Radio selected={isActive} size={19} variant="filled" dotSize={7} />
            </View>
            <View style={styles.texts}>
              <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 寸法・色・文字サイズはデザイン案A（「記録する項目フィールド デザイン案.html」、35案の比較検討を
// 経て確定）の値をそのまま使う。フォーム内の他の入力枠（BoxedTextInput: borderStrong / radius 8）とは
// 意図的に体裁が違う——上のカテゴリチップ群と視覚的に切り離すための囲みであるため
const styles = StyleSheet.create({
  // 上のカテゴリチップ群と視覚的に切り離すための囲み。overflow:hiddenは、選択行の背景色が
  // 角丸の外側にはみ出さないようにするために要る
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  // 高さは paddingVertical 9×2 + 1行目18 + 2行目16 = 52px。ジムでのタップ精度のため
  // 44pt以上を確保する必要があり、paddingを下げないこと
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowActive: { backgroundColor: Colors.accentSurface },
  radio: { marginTop: 2 },
  texts: { flex: 1 },
  // 14pxの選択肢名に相当するトークンはmetricのみ（14/18/600）。太さは選択状態で
  // 500↔700に振るため、トークンの600は使わず都度上書きする
  label: { ...Typography.metric, fontWeight: '500', color: Colors.textPrimary },
  labelActive: { fontWeight: '700', color: Colors.accent },
  // captionCompactは11/17。ここは1行に収める補足なので行間を詰める
  description: { ...Typography.captionCompact, lineHeight: 16, color: Colors.textPlaceholder },
});
