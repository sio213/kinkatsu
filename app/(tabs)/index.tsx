import ParallaxScrollView from '@/components/parallax-scroll-view';
import { PermissionBanner } from '@/components/reminders/permission-banner';
import { ReminderCard } from '@/components/reminders/reminder-card';
import { ReminderForm } from '@/components/reminders/reminder-form';
import { ReminderListBoundary } from '@/components/reminders/reminder-list-boundary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useReminders } from '@/hooks/use-reminders';
import {
  ensurePermission,
  getPermissionState,
} from '@/lib/notifications/permissions';
import type { ReminderInput } from '@/lib/notifications/types';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const { reminders, createReminder, updateReminder, toggleReminder, removeReminder, getNextFire } =
    useReminders();

  const [permState, setPermState] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
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
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      {permState && permState !== 'granted' && (
        <PermissionBanner state={permState} onRequest={handleRequestPermission} />
      )}

      <ThemedView style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle">筋トレリマインダー</ThemedText>
          {!showForm && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>＋ 追加</Text>
            </TouchableOpacity>
          )}
        </View>

        {reminders.length === 0 && !showForm && (
          <Text style={styles.empty}>リマインダーがありません</Text>
        )}

        <ReminderListBoundary>
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
            />
          ))}
        </ReminderListBoundary>

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
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },

  section: { gap: 12, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { color: '#999', textAlign: 'center', paddingVertical: 16 },

  addFormWrapper: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  addFormTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
});
