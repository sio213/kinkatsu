import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useWorkoutSession, useWorkoutSessions } from '@/hooks/use-workout-session';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const sessionId = Number(id);
  const { session, loaded } = useWorkoutSession(sessionId);
  const { endSession } = useWorkoutSessions();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFinish = async () => {
    try {
      await endSession(sessionId);
      router.back();
    } catch (e) {
      console.error('[workout session finish]', e);
      Alert.alert('エラー', 'トレーニングを終了できませんでした。');
    }
  };

  const handleAddExercise = () => {
    // T3（種目追加ピッカー）実装後にここから配線する
  };

  if (loaded && !session) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>トレーニングが見つかりません</Text>
          <TouchableOpacity style={styles.notFoundBackBtn} onPress={() => router.back()}>
            <Text style={styles.notFoundBackBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) return null;

  const dateLabel = new Date(session.startedAt).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>トレーニング中</Text>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>
        <View style={styles.timerChip}>
          <IconSymbol name="timer" size={16} color={Colors.accent} />
          <Text style={styles.timerText}>{formatElapsed(now - session.startedAt)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.emptyText}>まだ種目がありません</Text>
        <TouchableOpacity style={styles.addExerciseBtn} onPress={handleAddExercise}>
          <IconSymbol name="plus" size={18} color={Colors.accent} />
          <Text style={styles.addExerciseBtnText}>種目を追加</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>トレーニングを終了</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  headerDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  finishBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  finishBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 15 },

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
