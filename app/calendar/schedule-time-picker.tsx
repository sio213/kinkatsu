import { FormField } from '@/components/ui/form-field';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { parseDateKey } from '@/lib/calendar/date-grid';
import { addScheduledWorkout } from '@/lib/calendar/scheduled-workouts';
import { formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面2（PR10）。時刻はデザイン未確定だったため、
// components/reminders/reminder-form.tsxの時刻入力（iOSは常時インラインspinner、Androidは
// ボタン+モーダル、スタイルも同一に揃える）をそのまま踏襲する。デフォルト18:00もreminder-form.tsxの
// 新規リマインダーのデフォルトと揃え、アプリ内での「トレーニングの標準時刻」感を一貫させる
export default function ScheduleTimePickerScreen() {
  const { dateKey, routineId: routineIdParam, routineName } = useLocalSearchParams<{
    dateKey: string;
    routineId: string;
    routineName: string;
  }>();
  const routineId = Number(routineIdParam);
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(0);

  function handleTimeChange(_: unknown, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidTimePicker(false);
    if (!date) return;
    setHour(date.getHours());
    setMinute(date.getMinutes());
  }

  const timeDate = new Date();
  timeDate.setHours(hour, minute, 0, 0);
  const timeLabel = formatHourMinuteParts(hour, minute);
  const showTimePicker = Platform.OS === 'ios' || showAndroidTimePicker;

  const handleConfirm = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await addScheduledWorkout(routineId, dateKey, hour, minute);
      // 画面2→画面1→カレンダー画面の2階層を一度に閉じる
      // (app/workout/routine-load.tsxのrouter.dismiss(2)と同じ考え方)
      router.dismiss(2);
    } catch (e) {
      console.error('[add scheduled workout]', e);
      Alert.alert('エラー', '予定を追加できませんでした。');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [routineId, dateKey, hour, minute, router]);

  // 前画面(schedule-routine-picker.tsx)は必ず数値のroutineIdをparamsで渡すが、
  // app/workout/routine-load.tsxと同じく不正な直リンク等への防御として明示的にガードする
  if (!Number.isFinite(routineId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '時刻を選択' }} />
        <NotFoundState message="ルーティンが見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title={formatSessionDateGroup(parseDateKey(dateKey).getTime())} subtitle={routineName} />
          ),
        }}
      />
      <View style={styles.content}>
        <FormField label="時刻">
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.timeButton} onPress={() => setShowAndroidTimePicker(true)}>
              <Text style={styles.timeButtonText}>{timeLabel}</Text>
            </TouchableOpacity>
          )}
          {showTimePicker && (
            <DateTimePicker
              value={timeDate}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
            />
          )}
        </FormField>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="この時刻で追加" onPress={handleConfirm} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: 16, gap: 16 },
  timeButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  timeButtonText: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 2 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
