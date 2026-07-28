import { DesignIcon, type DesignIconName } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  // 「アイコン＋説明つきの縦積みリスト」というデザイン案の性格上、3つのアイコンが必ず縦に
  // 並んで見えるため、IconSymbol（iOSはSF Symbols）ではなくMaterial Symbolsのパスで統一する
  // （SF Symbolsのrepeat相当がデザイン案と形状・線幅ともに合わないため。components/ui/design-icon.tsx参照）
  icon: DesignIconName;
  label: string;
  /** ラベルの下に出す1行の説明（「好きな種目を選んで開始」など） */
  description: string;
  onPress: () => void;
  /**
   * 過去日の事後記録モード(app/workout/start-chooser.tsx)専用の補足。カード自体のラベル・説明は
   * 今日のライブ開始フローと同じままにし、視覚的な日付サブタイトルだけでは伝わりにくい
   * VoiceOverユーザー向けに対象日を読み上げで補う
   */
  hint?: string;
};

// 「開始/予定の方法を1つ選ぶ」リストの1行。トレーニング開始選択画面
// （app/workout/start-chooser.tsx）とカレンダーの「予定を追加」
// （app/calendar/schedule-chooser.tsx）で共有する
export function StartMethodRow({ icon, label, description, onPress, hint }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // accessibilityLabelを付けると子のTextは読み上げられなくなるため、画面上の説明文を
      // hintとして明示的に読ませる（過去日モードでは対象日の補足も続けて読ませる）
      accessibilityHint={hint ? `${description}。${hint}` : description}
    >
      <DesignIcon name={icon} size={24} color={Colors.accent} />
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <IconSymbol name="chevron.right" size={IconSizes.cardChevron} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 13,
  },
  texts: { flex: 1, gap: 2 },
  label: { ...Typography.cardTitle, color: Colors.textPrimary },
  description: { ...Typography.caption, color: Colors.textMuted },
});
