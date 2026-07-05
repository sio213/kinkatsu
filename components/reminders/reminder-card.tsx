import { Colors } from '@/constants/theme';
import type { Reminder } from '@/db/schema';
import { formatKindSummary, formatNextFire } from '@/lib/notifications/format';
import type { ReminderInput, ReminderKind } from '@/lib/notifications/types';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ReminderForm } from './reminder-form';

type Props = {
  reminder: Reminder;
  isEditing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onSubmit: (input: ReminderInput) => void;
  getNextFire: (r: Reminder) => Date | null;
  now: Date;
};

function buildEditInput(r: Reminder): ReminderInput {
  return {
    title: r.title,
    body: r.body,
    kind: r.kind as ReminderKind,
    hour: r.hour,
    minute: r.minute,
    weekdays: r.weekdays ? JSON.parse(r.weekdays) : undefined,
    monthdays: r.monthdays ? JSON.parse(r.monthdays) : undefined,
    anchorDate: r.anchorDate ?? undefined,
    intervalDays: r.intervalDays ?? undefined,
    intervalMonths: r.intervalMonths ?? undefined,
    nthWeek: r.nthWeek ?? undefined,
    nthWeekday: r.nthWeekday ?? undefined,
    enabled: r.enabled,
  };
}

export function ReminderCard({
  reminder: r,
  isEditing,
  onEdit,
  onCloseEdit,
  onDelete,
  onToggle,
  onSubmit,
  getNextFire,
  now,
}: Props) {
  return (
    <View>
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.info}>
            <Text style={styles.title}>{r.title}</Text>
            <Text style={styles.summary}>{formatKindSummary(r)}</Text>
            <Text style={styles.next}>{formatNextFire(getNextFire(r), now)}</Text>
          </View>
          <Switch
            value={r.enabled}
            onValueChange={onToggle}
            accessibilityLabel={`${r.title}を${r.enabled ? '無効' : '有効'}にする`}
          />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={isEditing ? onCloseEdit : onEdit}
            accessibilityLabel={isEditing ? '編集を閉じる' : `${r.title}を編集`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.actionBtnText}>{isEditing ? '閉じる' : '編集'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={onDelete}
            accessibilityLabel={`${r.title}を削除`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>
      {isEditing && (
        <View style={styles.editWrapper}>
          <Text style={styles.editTitle}>リマインダーを編集</Text>
          <ReminderForm
            initial={buildEditInput(r)}
            onSubmit={onSubmit}
            onCancel={onCloseEdit}
            submitLabel="保存"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  summary: { fontSize: 13, color: Colors.textMuted },
  next: { fontSize: 11, color: Colors.textPlaceholder },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Colors.border,
  },
  actionBtnText: { fontSize: 12, color: Colors.textBody, fontWeight: '500' },
  actionBtnDanger: { backgroundColor: Colors.dangerSurface },
  actionBtnDangerText: { color: Colors.danger },

  editWrapper: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  editTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
});
