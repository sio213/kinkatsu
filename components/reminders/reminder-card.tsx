import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import type { Reminder } from '@/db/schema';
import { formatKindSummary, formatNextFire } from '@/lib/notifications/format';
import type { ReminderInput, ReminderKind } from '@/lib/notifications/types';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ReminderForm } from './reminder-form';

type Props = {
  reminder: Reminder;
  isEditing: boolean;
  isToggling?: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onSubmit: (input: ReminderInput) => void;
  getNextFire: (r: Reminder) => Date | null;
  now: Date;
};

export function buildEditInput(r: Reminder): ReminderInput {
  return {
    // ルーティン由来のリマインダー(routineId有り)を編集・保存する経路がここに来た場合でも
    // 紐付けを保つため引き継ぐ。省略するとupdateReminder側でnull扱いになり、保存のたびに
    // ルーティンとの紐付けが切れてしまう
    routineId: r.routineId,
    title: r.title,
    body: r.body,
    kind: r.kind as ReminderKind,
    hour: r.hour,
    minute: r.minute,
    weekdays: r.weekdays ? JSON.parse(r.weekdays) : undefined,
    // monthdays未設定の毎年は、以前anchorDateに発火日そのものをエンコードしていた旧形式のデータ
    monthdays: r.monthdays
      ? JSON.parse(r.monthdays)
      : r.kind === 'yearly' && r.anchorDate
        ? [new Date(r.anchorDate).getDate()]
        : undefined,
    anchorDate: r.anchorDate ?? undefined,
    intervalDays: r.intervalDays ?? undefined,
    intervalMonths: r.intervalMonths ?? undefined,
    nthWeek: r.nthWeek ?? undefined,
    nthWeekdays: r.nthWeekdays ? JSON.parse(r.nthWeekdays) : undefined,
    enabled: r.enabled,
  };
}

export function ReminderCard({
  reminder: r,
  isEditing,
  isToggling,
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
            <Text style={styles.title} numberOfLines={1}>{r.title}</Text>
            <Text style={styles.summary}>{formatKindSummary(r)}</Text>
            <Text style={styles.next}>{formatNextFire(getNextFire(r), now)}</Text>
          </View>
          <Switch
            value={r.enabled}
            onValueChange={onToggle}
            disabled={isToggling}
            accessibilityLabel={r.title}
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
            // ルーティン由来のリマインダー(routineId有り)はタイトル・本文をルーティン名から
            // 自動生成する(lib/routines/reminder-input.tsのwithRoutineReminderContent)。
            // ここで編集可能にしてしまうと、次にルーティンを保存したタイミングで無言で
            // 上書きされてしまうため、この一覧タブ経由の編集でも隠して一貫させる
            showTitleBody={r.routineId == null}
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
  title: { ...Typography.cardTitle, color: Colors.textPrimary },
  summary: { ...Typography.footnote, color: Colors.textMuted },
  next: { ...Typography.caption, color: Colors.textPlaceholder },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Colors.border,
  },
  actionBtnText: { ...Typography.caption, color: Colors.textBody },
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
  editTitle: { ...Typography.cardTitle, color: Colors.textPrimary, marginBottom: 8 },
});
