import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { StartMethodCard } from '@/components/workout/start-method-card';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面0（2026-07-20新設）。app/workout/start-chooser.tsxと
// 同じ4択レイアウト（StartMethodCard再利用、「おすすめメニュー」「履歴から」はdisabledのプレースホルダー）を
// 予定作成向けに流用する。「ルーティン」は既存のschedule-routine-pickerへ、「直接追加」は新設の
// schedule-exercise-pickerへ、それぞれdateKeyを引き継いで遷移するだけ（この画面自体はDBに触れない）
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

  // カレンダー画面から遷移する限り不正なdateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-routine-picker.tsxと同じ方針）
  if (!isValidDateKey(dateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'どう予定する？' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const dateLabel = formatSessionDateGroup(parseDateKey(dateKey).getTime());

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="どう予定する？" subtitle={dateLabel} />,
        }}
      />
      <View style={styles.grid}>
        <View style={styles.row}>
          <StartMethodCard icon="sparkles" label="おすすめメニュー" disabled />
          <StartMethodCard icon="clock.arrow.circlepath" label="履歴から" disabled />
        </View>
        <View style={styles.row}>
          <StartMethodCard
            icon="dumbbell.fill"
            label="直接追加"
            onPress={handlePickDirect}
            hint={`${dateLabel}の予定として種目を選びます`}
          />
          <StartMethodCard
            icon="list.bullet"
            label="ルーティン"
            onPress={handlePickRoutine}
            hint={`${dateLabel}の予定としてルーティンを選びます`}
          />
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
