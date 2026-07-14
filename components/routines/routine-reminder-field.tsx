import { PermissionBanner } from '@/components/reminders/permission-banner';
import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import { formatNextFire } from '@/lib/notifications/format';
import type { PermissionState } from '@/lib/notifications/permissions';
import type { ReminderInput } from '@/lib/notifications/types';
import { previewNextFireDate, previewReminderSummary } from '@/lib/routines/reminder-input';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  reminder: ReminderInput | null;
  onPressConfigure: () => void;
  permState: PermissionState | null;
  onRequestPermission: () => void;
  now: Date;
  // routineFormSchemaのrefineによるバリデーションエラーの有無。実際のエラー文言表示は
  // 呼び出し側(routine-form.tsxのFormField)に任せ、ここでは未設定時のヒント文言を
  // エラーと同時に出さないための判定にだけ使う
  hasError?: boolean;
};

// デザイン案(デザイン検討/ルーティン デザイン案.html「リマインダー — 実装方針サンプル」)に準拠。
// トグルON/OFF×設定済み/未設定の4パターン:
// - OFF+未設定: トグル行のみ(何も出さない)
// - OFF+設定済み: 設定行を残すが薄いグレー(opacity .45)にしタップも無効化する(値は保持)
// - ON+未設定: 「通知タイミングを設定」の行(タップで設定画面へ)+ヒント文言
// - ON+設定済み: 頻度要約。次回発火時刻は端末通知が許可されている場合のみ表示
// 端末通知が拒否のときはPermissionBannerを設定行の上に表示する。この間は設定画面を開いても
// 通知は届かないため、設定行自体もopacity .6にした上でタップを無効化する(トグルOFFによる
// .45の「操作不可」とは見た目の濃さを分けているが、どちらも操作不可という点は同じ)
export function RoutineReminderField({
  enabled,
  onToggleEnabled,
  reminder,
  onPressConfigure,
  permState,
  onRequestPermission,
  now,
  hasError,
}: Props) {
  const permissionDenied = enabled && permState != null && permState !== 'granted';
  const boxDisabled = !enabled || permissionDenied;
  const boxOpacity = !enabled ? 0.45 : permissionDenied ? 0.6 : 1;
  const showNextFire = enabled && reminder != null && permState === 'granted';
  const showHint = enabled && !reminder && !hasError;
  const disabledReason = !enabled ? '(現在オフ)' : permissionDenied ? '(通知が許可されていません)' : '';

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Text style={styles.notifyLabel}>通知する</Text>
        <Switch value={enabled} onValueChange={onToggleEnabled} accessibilityLabel="通知する" />
      </View>

      {permissionDenied && (
        <PermissionBanner state={permState as 'denied' | 'undetermined'} onRequest={onRequestPermission} />
      )}

      {(enabled || reminder) && (
        <TouchableOpacity
          style={[styles.box, { opacity: boxOpacity }]}
          onPress={onPressConfigure}
          disabled={boxDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: boxDisabled }}
          accessibilityLabel={
            reminder
              ? `${previewReminderSummary(reminder)}${disabledReason}、タップして変更`
              : `通知タイミングを設定${disabledReason}`
          }
        >
          <DesignIcon name="calendar-today" size={18} color={Colors.accent} />
          {reminder ? (
            <Text style={styles.boxSummaryText} numberOfLines={1}>
              {previewReminderSummary(reminder)}
            </Text>
          ) : (
            <View style={styles.boxPlaceholderGroup}>
              <Text style={styles.boxPlaceholderTitle}>通知タイミングを設定</Text>
              <Text style={styles.boxPlaceholderSubtitle}>タップして設定</Text>
            </View>
          )}
          <IconSymbol name="chevron.right" size={18} color={Colors.textPlaceholder} />
        </TouchableOpacity>
      )}

      {showNextFire && (
        <Text style={styles.nextFireText}>{formatNextFire(previewNextFireDate(reminder, now), now)}</Text>
      )}

      {showHint && <Text style={styles.hintText}>未設定のうちは通知されません。</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifyLabel: { ...Typography.bodyStrong, color: Colors.textPrimary },

  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  boxSummaryText: { ...Typography.footnote, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  boxPlaceholderGroup: { flex: 1, gap: 1 },
  boxPlaceholderTitle: { ...Typography.footnote, fontWeight: '600', color: Colors.textPrimary },
  boxPlaceholderSubtitle: { ...Typography.caption, fontWeight: '500', color: Colors.textPlaceholder },

  nextFireText: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted },
  hintText: { ...Typography.caption, fontWeight: '400', color: Colors.textMuted },
});
