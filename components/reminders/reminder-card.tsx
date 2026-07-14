import { IconSymbol } from '@/components/ui/icon-symbol';
import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import type { Reminder } from '@/db/schema';
import { formatKindSummary, formatNextFire } from '@/lib/notifications/format';
import type { ReminderInput } from '@/lib/notifications/types';
import { buildEditInput } from '@/lib/notifications/validation';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ReminderForm } from './reminder-form';

export { buildEditInput };

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
  // ルーティン由来のリマインダー(routineId有り)をタップしたときの遷移先。
  // routineIdがnull(単体リマインダー)のときは呼ばれない
  onOpenRoutine?: (routineId: number) => void;
};

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
  onOpenRoutine,
}: Props) {
  const isFromRoutine = r.routineId != null;

  return (
    <View>
      <View style={styles.card}>
        {isFromRoutine && (
          <TouchableOpacity
            style={styles.routineBadge}
            onPress={() => onOpenRoutine?.(r.routineId!)}
            accessibilityRole="button"
            accessibilityLabel={`${r.title}はルーティンのリマインダーです。ルーティン編集画面を開く`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="list.bullet.clipboard" size={13} color={Colors.textMuted} />
            <Text style={styles.routineBadgeText}>ルーティンのリマインダー</Text>
            <IconSymbol name="chevron.right" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
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
          {/* ルーティン由来のリマインダーは、単体削除すると次にルーティン編集画面を開いたときに
              「未設定」状態に見えてしまう(このカード上部のバッジからルーティン編集画面へ遷移し、
              そちら側のトグルOFFで無効化してもらう導線に一本化する) */}
          {!isFromRoutine && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger]}
              onPress={onDelete}
              accessibilityLabel={`${r.title}を削除`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>削除</Text>
            </TouchableOpacity>
          )}
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
  routineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  routineBadgeText: { ...Typography.footnote, fontWeight: '600', color: Colors.textBody },

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
