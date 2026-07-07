import { DesignIcon } from '@/components/ui/design-icon';
import { Colors } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// デザインのスナックバー配色（暗い背景+明るい青のチェック）はライトテーマのColorsトークンに
// 無いため、この一箇所だけ生値を使う
const TOAST_BACKGROUND = '#1E293B';
const TOAST_ACCENT = '#93C5FD';

type Props = {
  message: string;
  onUndo: () => void;
};

// 「過去の記録から読み込む」実行後、トレーニング中画面下部に出す取り消し可能な通知
export function HistoryLoadToast({ message, onUndo }: Props) {
  return (
    <View style={styles.toast} accessibilityLiveRegion="polite">
      <DesignIcon name="check-circle" size={16} color={TOAST_ACCENT} />
      <Text style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={onUndo}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="読み込みを取り消す"
      >
        <Text style={styles.undo}>取り消す</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TOAST_BACKGROUND,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  message: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  undo: { fontSize: 13, fontWeight: '700', color: TOAST_ACCENT, textDecorationLine: 'underline' },
});
