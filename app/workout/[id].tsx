import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useSessionSetCount, useWorkoutSession } from '@/hooks/use-workout-session';
import { endWorkoutSession } from '@/lib/workout/session';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const parsedId = Number(id);
  const sessionId = Number.isFinite(parsedId) ? parsedId : null;
  const { session, loaded } = useWorkoutSession(sessionId ?? -1);
  const setCount = useSessionSetCount(sessionId ?? -1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session || session.endedAt != null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  const finish = async () => {
    if (sessionId == null) return;
    try {
      await endWorkoutSession(sessionId);
      router.back();
    } catch (e) {
      console.error('[workout session finish]', e);
      Alert.alert('エラー', 'トレーニングを終了できませんでした。');
    }
  };

  const handleFinish = () => {
    if (setCount === 0) {
      Alert.alert('トレーニングを終了', 'まだ種目を記録していません。終了しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '終了する', style: 'destructive', onPress: finish },
      ]);
      return;
    }
    finish();
  };

  // 種目追加ピッカーの実装後にここから配線する
  const handleAddExercise = () => {};

  if (sessionId == null || (loaded && !session)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>トレーニングが見つかりません</Text>
          <TouchableOpacity
            style={styles.notFoundBackBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="戻る"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.notFoundBackBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'トレーニング中',
          headerRight: () => (
            <View style={styles.timerChip}>
              <IconSymbol name="timer" size={16} color={Colors.accent} />
              <Text style={styles.timerText}>{formatElapsed(now - session.startedAt)}</Text>
            </View>
          ),
        }}
      />
      <View style={styles.subHeader}>
        <Text style={styles.headerDate}>{formatSessionDateGroup(session.startedAt)}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.emptyText}>まだ種目がありません</Text>
        <TouchableOpacity
          style={styles.addExerciseBtn}
          onPress={handleAddExercise}
          accessibilityRole="button"
          accessibilityLabel="種目を追加"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="plus" size={18} color={Colors.accent} />
          <Text style={styles.addExerciseBtnText}>種目を追加</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="トレーニングを終了" onPress={handleFinish} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  subHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  headerDate: { fontSize: 12, color: Colors.textMuted },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  timerText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  emptyText: { fontSize: 13.5, color: Colors.textPlaceholder },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addExerciseBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 14, color: Colors.textPlaceholder },
  notFoundBackBtn: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notFoundBackBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 },
});
