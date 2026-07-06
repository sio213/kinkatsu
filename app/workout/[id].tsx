import { IconSymbol } from '@/components/ui/icon-symbol';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { AddExerciseButton } from '@/components/workout/add-exercise-button';
import { SessionExerciseCard } from '@/components/workout/session-exercise-card';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import {
  EMPTY_SETS,
  useSessionExercises,
  useSessionSetCount,
  useSessionSets,
  useWorkoutSession,
} from '@/hooks/use-workout-session';
import { endWorkoutSession } from '@/lib/workout/session';
import { formatSessionDateGroup, formatSessionDuration } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
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
  const sessionExercises = useSessionExercises(sessionId ?? -1);
  const sessionSets = useSessionSets(sessionId ?? -1);
  const [now, setNow] = useState(() => Date.now());
  const isFinishingRef = useRef(false);
  const keyboardInset = useKeyboardInset();
  // 種目カードのアコーディオン開閉状態。カード側のローカルstateにすると、FlatListの
  // virtualizationでカードがアンマウント→再マウントされた際に開閉状態がリセットされてしまうため、
  // この画面が生きている間は保持されるようここで持つ（値未保存=展開中がデフォルト）
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  const handleToggleCollapsed = useCallback((sessionExerciseId: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionExerciseId)) {
        next.delete(sessionExerciseId);
      } else {
        next.add(sessionExerciseId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!session || session.endedAt != null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  const finish = async () => {
    if (sessionId == null) return;
    // 連打でendWorkoutSession/router.backが二重に呼ばれるのを防ぐ
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    try {
      await endWorkoutSession(sessionId);
      router.back();
    } catch (e) {
      console.error('[workout session finish]', e);
      Alert.alert('エラー', 'トレーニングを終了できませんでした。');
    } finally {
      isFinishingRef.current = false;
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

  const handleAddExercise = () => {
    if (sessionId == null) return;
    router.push({ pathname: '/workout/exercise-picker', params: { sessionId: String(sessionId) } });
  };

  if (sessionId == null || (loaded && !session)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  if (!session) return null;

  // endedAtがあれば終了済み＝過去の記録を開いている（見た目は共用しつつ、進行中固有の
  // UI（リアルタイムタイマー・「トレーニングを終了」ボタン）だけを出し分ける）
  const isActive = session.endedAt == null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: isActive ? 'トレーニング中' : '記録の編集',
          headerRight: () => (
            <View style={styles.timerChip}>
              <IconSymbol name="timer" size={16} color={Colors.accent} />
              <Text style={styles.timerText}>
                {isActive
                  ? formatElapsed(now - session.startedAt)
                  : formatSessionDuration(session.startedAt, session.endedAt)}
              </Text>
            </View>
          ),
        }}
      />
      <View style={styles.subHeader}>
        <Text style={styles.headerDate}>{formatSessionDateGroup(session.startedAt)}</Text>
      </View>

      {sessionExercises.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.emptyText}>まだ種目がありません</Text>
          <AddExerciseButton onPress={handleAddExercise} />
        </View>
      ) : (
        <FlatList
          style={styles.exerciseList}
          contentContainerStyle={styles.exerciseListContent}
          data={sessionExercises}
          keyExtractor={(item) => String(item.sessionExerciseId)}
          renderItem={({ item, index }) => (
            <ListErrorBoundary>
              <SessionExerciseCard
                exercise={item}
                sessionId={sessionId}
                sets={sessionSets.get(item.sessionExerciseId) ?? EMPTY_SETS}
                collapsed={collapsedIds.has(item.sessionExerciseId)}
                isFirst={index === 0}
                isLast={index === sessionExercises.length - 1}
                onToggleCollapsed={handleToggleCollapsed}
              />
            </ListErrorBoundary>
          )}
          ListFooterComponent={
            <AddExerciseButton onPress={handleAddExercise} style={styles.addExerciseBtnInline} />
          }
          contentInset={{ bottom: keyboardInset }}
          scrollIndicatorInsets={{ bottom: keyboardInset }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {isActive && (
        <View style={styles.footer}>
          <PrimaryButton label="トレーニングを終了" onPress={handleFinish} />
        </View>
      )}
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

  exerciseList: { flex: 1 },
  exerciseListContent: { padding: 16, gap: 10 },
  addExerciseBtnInline: { marginTop: 4 },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
