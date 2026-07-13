import { PermissionBanner } from '@/components/reminders/permission-banner';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import { formatNextFire } from '@/lib/notifications/format';
import type { ReminderInput } from '@/lib/notifications/types';
import type { PermissionState } from '@/lib/notifications/permissions';
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
};

// ルーティンフォームの「リマインダー」セクション。トグルON/OFF×設定済み/未設定の
// 4パターンを持つ(design memo「リマインダー — 実装方針サンプル」参照):
// OFF+未設定は行のみ、OFF+設定済みは設定内容をグレー表示、ON+未設定は「設定」を促す行
// (未設定のまま保存しようとするとroutineFormSchemaのrefineでエラーになる)、
// ON+設定済みは頻度要約+次回発火時刻を表示する。タップするといずれもリマインダー設定画面
// (app/routine/reminder.tsx)へ遷移し、設定/再設定できる
export function RoutineReminderField({
  enabled,
  onToggleEnabled,
  reminder,
  onPressConfigure,
  permState,
  onRequestPermission,
  now,
}: Props) {
  return (
    <View style={styles.container}>
      {/* 「リマインダー」の見出し自体はこのフィールドを包むFormField側(routine-form.tsx)の
          FormLabelが既に表示しているため、ここでは繰り返さずSwitchだけを右寄せで置く */}
      <View style={styles.toggleRow}>
        <Switch value={enabled} onValueChange={onToggleEnabled} accessibilityLabel="リマインダー" />
      </View>

      {reminder ? (
        <TouchableOpacity
          style={styles.summaryRow}
          onPress={onPressConfigure}
          accessibilityRole="button"
          accessibilityLabel={enabled ? 'リマインダーの設定を変更' : 'リマインダーの設定を変更(現在オフ)'}
        >
          <View style={styles.summaryTextGroup}>
            <Text style={[styles.summaryText, !enabled && styles.summaryTextDisabled]}>
              {previewReminderSummary(reminder)}
            </Text>
            {enabled && (
              <Text style={styles.nextFireText}>{formatNextFire(previewNextFireDate(reminder, now), now)}</Text>
            )}
          </View>
          <IconSymbol name="chevron.right" size={18} color={Colors.textPlaceholder} />
        </TouchableOpacity>
      ) : (
        enabled && (
          <TouchableOpacity
            style={styles.emptyPrompt}
            onPress={onPressConfigure}
            accessibilityRole="button"
            accessibilityLabel="リマインダーを設定"
          >
            <Text style={styles.emptyPromptText}>リマインダーを設定</Text>
            <IconSymbol name="chevron.right" size={18} color={Colors.accent} />
          </TouchableOpacity>
        )
      )}

      {enabled && permState && permState !== 'granted' && (
        <PermissionBanner state={permState} onRequest={onRequestPermission} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryTextGroup: { flex: 1, gap: 2 },
  summaryText: { ...Typography.cardTitle, color: Colors.textPrimary },
  // OFF時はテキスト色だけを落とし、chevron・背景・枠線は変えない(タップして再設定できることが
  // 見た目上も伝わるようにするため。行全体をopacityで薄くすると「操作不可」に見えてしまう)
  summaryTextDisabled: { color: Colors.textMuted },
  nextFireText: { ...Typography.caption, color: Colors.textMuted },

  emptyPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    borderRadius: 9,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  emptyPromptText: { ...Typography.bodyStrong, color: Colors.accent },
});
