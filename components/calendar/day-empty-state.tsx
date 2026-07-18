import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  // ボックス自体の装飾ではなく、内部のPrimaryButtonに渡すアイコン（誤解を避けるためbuttonIcon名にしている）
  buttonIcon: IconSymbolName;
  actionLabel: string;
  onPressAction: () => void;
};

// カレンダー選択日パネルの「記録なし」状態のうち、アクションボタンを持つもの（今日）専用。
// デザイン案指定の破線ボックス+全幅Primaryボタン。ボタンを持たない状態（過去日）は
// app/(tabs)/calendar.tsxの既存の単純なテキスト表示のままにしており、このコンポーネントは使わない
export function DayEmptyState({ buttonIcon, actionLabel, onPressAction }: Props) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>記録がありません</Text>
      <PrimaryButton
        label={actionLabel}
        onPress={onPressAction}
        style={styles.button}
        // routine-card.tsxの「開始」ボタンと同じアイコンサイズ(16)に揃える
        icon={<IconSymbol name={buttonIcon} size={16} color={Colors.onAccent} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  text: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted, marginBottom: 12 },
  button: { width: '100%' },
});
