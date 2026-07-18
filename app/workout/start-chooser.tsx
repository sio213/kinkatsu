import { StartMethodCard } from '@/components/workout/start-method-card';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { startWorkoutSession } from '@/lib/workout/session';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 「デザイン検討/開始方法を選ぶ 検討.html」（デザイン未確定と明記されたプレースホルダー）をそのまま
// 実装した画面。カレンダーの「今日・記録なし」パネルの「トレーニングを開始」ボタンから遷移する。
// 4択のうち「自分で選ぶ」「ルーティン」だけが現状実装可能（履歴から新規セッションを始める導線・
// おすすめメニュー機能自体が未実装のため）。動かないカードを隠さずdisabled+「準備中」表示にするのは、
// 4択のレイアウト自体はデザイン案を維持しつつ、将来の実装場所を示すための意図的な判断（要件確認済み）
export default function StartChooserScreen() {
  const pushDebounced = useDebouncedPush();
  // 記録タブ(app/(tabs)/index.tsx)・ルーティン一覧(app/routine/index.tsx)と同じ
  // useWorkoutStarter + pushDebouncedの組み合わせに揃える
  const startWorkout = useWorkoutStarter((sessionId) => pushDebounced(`/workout/${sessionId}`));

  // この画面は「進行中セッションが無い」ことを呼び出し元（カレンダーのhandleStartToday）が
  // 保証した上でのみ遷移してくる前提で、ここではactiveSessionの有無を再チェックしない
  // （index.tsx・routine/index.tsxのように複数経路から到達し得る画面ではないため）。
  // 将来この画面が他の入口からも開かれるようになった場合は、ここにもactiveSession分岐が必要になる
  const handlePickManually = useCallback(() => {
    startWorkout(async () => (await startWorkoutSession()).id);
  }, [startWorkout]);

  const handlePickRoutine = useCallback(() => {
    pushDebounced('/routine');
  }, [pushDebounced]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.grid}>
        <View style={styles.row}>
          <StartMethodCard icon="sparkles" label="おすすめメニュー" disabled />
          <StartMethodCard icon="clock.arrow.circlepath" label="履歴から" disabled />
        </View>
        <View style={styles.row}>
          <StartMethodCard icon="dumbbell.fill" label="自分で選ぶ" onPress={handlePickManually} />
          <StartMethodCard icon="list.bullet" label="ルーティン" onPress={handlePickRoutine} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  grid: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
});
