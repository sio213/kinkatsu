import { PermissionBanner } from '@/components/reminders/permission-banner';
import { ReminderCard } from '@/components/reminders/reminder-card';
import { ReminderForm } from '@/components/reminders/reminder-form';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useReminders } from '@/hooks/use-reminders';
import {
  ensurePermission,
  getPermissionState,
} from '@/lib/notifications/permissions';
import type { ReminderInput } from '@/lib/notifications/types';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RemindersScreen() {
  const { reminders, createReminder, updateReminder, toggleReminder, removeReminder, getNextFire, now } =
    useReminders();

  const [permState, setPermState] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const keyboardInset = useKeyboardInset();
  const [showForm, setShowForm] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);

  useEffect(() => {
    getPermissionState().then(setPermState);
  }, []);

  const openCreate = useCallback(() => {
    setEditTargetId(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((id: number) => {
    setEditTargetId(id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditTargetId(null);
  }, []);

  const handleSubmit = useCallback(
    async (input: ReminderInput) => {
      const perm = await ensurePermission();
      setPermState(perm);
      if (perm !== 'granted') {
        Alert.alert('通知が許可されていません', '設定から通知を有効にしてください。');
        return;
      }
      try {
        if (editTargetId != null) {
          await updateReminder(editTargetId, input);
        } else {
          await createReminder(input);
        }
        closeForm();
      } catch (e) {
        console.error('[reminder save]', e);
        Alert.alert('エラー', 'リマインダーの保存に失敗しました。');
      }
    },
    [editTargetId, createReminder, updateReminder, closeForm],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert('削除', 'このリマインダーを削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => removeReminder(id) },
      ]);
    },
    [removeReminder],
  );

  const handleRequestPermission = useCallback(async () => {
    const r = await ensurePermission();
    setPermState(r);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentInset={{ bottom: keyboardInset }}
          scrollIndicatorInsets={{ bottom: keyboardInset }}
        >
          {permState && permState !== 'granted' && (
            <PermissionBanner state={permState} onRequest={handleRequestPermission} />
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.title}>筋トレリマインダー</Text>
            {!showForm && (
              <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
                <Text style={styles.addBtnText}>＋ 追加</Text>
              </TouchableOpacity>
            )}
          </View>

          {reminders.length === 0 && !showForm && (
            <Text style={styles.empty}>リマインダーがありません</Text>
          )}

          <ListErrorBoundary>
            {reminders.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                isEditing={editTargetId === r.id && showForm}
                onEdit={() => openEdit(r.id)}
                onCloseEdit={closeForm}
                onDelete={() => handleDelete(r.id)}
                onToggle={(enabled) => toggleReminder(r.id, enabled)}
                onSubmit={handleSubmit}
                getNextFire={getNextFire}
                now={now}
              />
            ))}
          </ListErrorBoundary>

          {showForm && editTargetId == null && (
            <View style={styles.addFormWrapper}>
              <Text style={styles.addFormTitle}>リマインダーを追加</Text>
              <ReminderForm
                onSubmit={handleSubmit}
                onCancel={closeForm}
                submitLabel="追加"
              />
            </View>
          )}
        </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },
  empty: { color: Colors.textPlaceholder, textAlign: 'center', paddingVertical: 16 },

  addFormWrapper: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  addFormTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
});
