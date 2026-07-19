import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  // ボックス自体の装飾ではなく、内部のPrimaryButtonに渡すアイコン（誤解を避けるためbuttonIcon名にしている）
  buttonIcon: IconSymbolName;
  actionLabel: string;
  onPressAction: () => void;
  // 未来日「予定がありません」用（デザイン案）。省略時は従来通り「記録がありません」
  text?: string;
  // 未来日の「予定を追加」はPR10（手動予定追加）未実装のため、ボタンは無効表示に留める
  // （@planner案: disabled or 非表示。押せるのに何も起きない状態を避けるためdisabledを選択）。
  // components/workout/start-method-card.tsxの「準備中」表現（バッジ+accessibilityHint）を
  // 踏襲し、押せそうに見えるのに無反応という混乱を防ぐ（@designer指摘）
  disabled?: boolean;
};

// カレンダー選択日パネルの「記録/予定がありません」状態のうち、アクションボタンを持つもの
// （今日・未来日）専用。デザイン案指定の破線ボックス+全幅Primaryボタン。ボタンを持たない
// 状態（過去日）はapp/(tabs)/calendar.tsxの既存の単純なテキスト表示のままにしており、
// このコンポーネントは使わない
export function DayEmptyState({ buttonIcon, actionLabel, onPressAction, text = '記録がありません', disabled = false }: Props) {
  return (
    <View style={styles.box}>
      {disabled && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>準備中</Text>
        </View>
      )}
      <Text style={styles.text}>{text}</Text>
      <PrimaryButton
        label={actionLabel}
        onPress={onPressAction}
        disabled={disabled}
        accessibilityHint={disabled ? '準備中の機能です' : undefined}
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
    position: 'relative',
  },
  text: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted, marginBottom: 12 },
  button: { width: '100%' },
  // components/workout/start-method-card.tsxの「準備中」バッジと同じ見た目
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { ...Typography.badge, color: Colors.textMuted },
});
