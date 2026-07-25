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
// 同じレイアウト（StartMethodRow再利用）を予定作成向けに流用する。「種目を追加」は
// schedule-exercise-pickerへ、「ルーティン」はschedule-routine-pickerへ、それぞれdateKeyを
// 引き継いで遷移するだけ（この画面自体はDBに触れない）。
// 2026-07-25: トレーニング開始選択画面のデザイン確定に合わせ、2×2グリッド4択から縦リストへ変更した
// （@ユーザー指示）。「おすすめメニュー」「履歴から」のdisabledプレースホルダーは廃止。
// 「過去の記録から予定を作る」導線は、予定作成が時刻設定画面(schedule-time-picker)を挟む都合で
// 実績セットの引き継ぎ方から設計が必要なため、この時点では見送っている
// （既存予定に対する「過去の記録から読み込み」はschedule-workout-edit.tsxの⋮メニューにある）
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
      <View style={styles.list}>
        <StartMethodRow
          icon="add"
          label="種目を追加"
          description="好きな種目を選んで予定にする"
          onPress={handlePickDirect}
          hint={`${dateLabel}の予定として種目を選びます`}
        />
        <StartMethodRow
          icon="repeat"
          label="ルーティン"
          description="登録したメニューを予定にする"
          onPress={handlePickRoutine}
          hint={`${dateLabel}の予定としてルーティンを選びます`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { paddingHorizontal: 16, paddingTop: 14, gap: 11 },
});
