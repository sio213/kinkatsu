import { DesignIcon } from '@/components/ui/design-icon';
import { Colors } from '@/constants/theme';
import { useEffect } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const DEFAULT_DURATION_MS = 4000;

// 記録画面下部に浮かせて出す一時通知（例: 前回のセットを自動挿入したことの案内＋アンドゥ）。
// 確認ダイアログにすると毎回の操作が煩わしくなるため、数秒で自動的に消える形にしている
// （デザイン案P14「挿入＋アンドゥ」。消えたことに気づかれないリスクは許容する前提）
export function Snackbar({
  visible,
  message,
  actionLabel,
  onPressAction,
  onDismiss,
  duration = DEFAULT_DURATION_MS,
  style,
}: {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onPressAction?: () => void;
  onDismiss: () => void;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // messageもdepsに含めることで、表示中に別のプリフィルが続けて起きて内容だけ変わった場合も
  // タイマーが最新表示から仕切り直しになる
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message, duration]);

  // accessibilityLiveRegionはAndroid専用でVoiceOver(iOS)には効かないため、出現時に
  // 明示的に読み上げさせる。actionLabelがある場合は存在にも気づけるよう文言に含める
  useEffect(() => {
    if (!visible) return;
    AccessibilityInfo.announceForAccessibility(
      actionLabel ? `${message}。${actionLabel}ボタンあり` : message,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message]);

  if (!visible) return null;

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.messageRow}>
        <DesignIcon name="check-circle" size={18} color={Colors.snackbarIcon} />
        <Text style={styles.message}>{message}</Text>
      </View>
      {actionLabel && onPressAction ? (
        <TouchableOpacity
          onPress={onPressAction}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.snackbarBackground,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  message: { fontSize: 13.5, fontWeight: '600', color: Colors.snackbarText, flexShrink: 1 },
  // アイコン（状態表示・非インタラクティブ）と色が同じなため、下線でタップ可能な要素だと分かるようにする
  action: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.snackbarAction,
    textDecorationLine: 'underline',
  },
});
