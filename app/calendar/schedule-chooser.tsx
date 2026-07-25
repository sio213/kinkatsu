import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { StartMethodRow } from '@/components/workout/start-method-row';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面0（2026-07-20新設）。app/workout/start-chooser.tsxと
// 同じレイアウト（StartMethodRow再利用）を予定作成向けに流用する。3択とも、それぞれの画面へ
// dateKeyを引き継いで遷移するだけ（この画面自体はDBに触れない）。予定の実体は、どの経路でも
// 時刻設定画面(schedule-time-picker)で時刻を確定した時点で初めて作られる。
// 2026-07-25: トレーニング開始選択画面のデザイン確定に合わせ、2×2グリッド4択から縦リストへ変更し
// （@ユーザー指示）「おすすめメニュー」「履歴から」のdisabledプレースホルダーを廃止。あわせて
// 開始選択画面と同じ3択になるよう「過去の記録」を実装した（@ユーザー指示）
export default function ScheduleChooserScreen() {
  const { dateKey } = useLocalSearchParams<{ dateKey: string }>();
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handlePickDirect = useCallback(() => {
    pushDebounced({ pathname: '/calendar/schedule-exercise-picker', params: { dateKey } });
  }, [pushDebounced, dateKey]);

  const handlePickRoutine = useCallback(() => {
    pushDebounced({ pathname: '/calendar/schedule-routine-picker', params: { dateKey } });
  }, [pushDebounced, dateKey]);

  // 既存予定の⋮「過去の記録から読み込み」と同じ画面へ送る（app/workout/start-chooser.tsxの
  // 「過去の記録」と同じ考え方）。あちらは既存予定に種目を足す導線なので、こちらは
  // scheduledWorkoutIdの代わりにdateKeyを渡し、予定がまだ無い状態で同じ画面を開く
  const handlePickHistory = useCallback(() => {
    pushDebounced({ pathname: '/calendar/schedule-workout-history-picker', params: { dateKey } });
  }, [pushDebounced, dateKey]);

  // カレンダー画面から遷移する限り不正なdateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-routine-picker.tsxと同じ方針）
  if (!isValidDateKey(dateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '予定を追加' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const dateLabel = formatSessionDateGroup(parseDateKey(dateKey).getTime());

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="予定を追加" subtitle={dateLabel} />,
        }}
      />
      <View style={styles.list}>
        <StartMethodRow
          icon="add"
          label="種目を追加"
          description="好きな種目を選んで予定を作る"
          onPress={handlePickDirect}
          hint={`${dateLabel}の予定として種目を選びます`}
        />
        <StartMethodRow
          icon="repeat"
          label="ルーティン"
          description="登録したメニューから予定を作る"
          onPress={handlePickRoutine}
          hint={`${dateLabel}の予定としてルーティンを選びます`}
        />
        <StartMethodRow
          icon="history"
          label="過去の記録"
          description="過去の履歴と同じ内容で予定を作る"
          onPress={handlePickHistory}
          hint={`${dateLabel}の予定として過去のトレーニングを選びます`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { paddingHorizontal: 16, paddingTop: 14, gap: 11 },
});
