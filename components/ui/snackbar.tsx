import { IconSymbol } from '@/components/ui/icon-symbol';
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

const DEFAULT_DURATION_MS = 6000;

// 種目カード内に埋め込んで出す一時通知（例: 前回のセットを自動挿入したことの案内＋アンドゥ）。
// 確認ダイアログにすると毎回の操作が煩わしくなるため、数秒で自動的に消える形にしている
// （デザイン案P14「挿入＋アンドゥ」。消えたことに気づかれないリスクは許容する前提）
export function Snackbar({
  visible,
  // FlatList内でスクロールしないと画面に映らない位置に表示されるケースがあるため、
  // 「実際にビューポート内に入った」ことを呼び出し側から伝えてもらい、それまでは
  // 自動消滅タイマーを開始しない（見えないまま消えるのを防ぐ）。既定はtrueで、
  // ビューポート判定が不要な単純な呼び出し元は今まで通りvisible=true immediately timerでよい
  armed = true,
  message,
  actionLabel,
  onPressAction,
  onDismiss,
  duration = DEFAULT_DURATION_MS,
  style,
}: {
  visible: boolean;
  armed?: boolean;
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
    if (!visible || !armed) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, armed, message, duration]);

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
        <IconSymbol name="clock.arrow.circlepath" size={17} color={Colors.accent} />
        <Text style={styles.message}>{message}</Text>
      </View>
      {actionLabel && onPressAction ? (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPressAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
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
    gap: 10,
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  message: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  actionButton: {
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.onAccent },
});
