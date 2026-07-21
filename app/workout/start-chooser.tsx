import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { StartMethodCard } from '@/components/workout/start-method-card';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { dateKeyToNoonMs, isValidDateKey } from '@/lib/calendar/date-grid';
import { createPastWorkoutSession, startWorkoutSession } from '@/lib/workout/session';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 「デザイン検討/開始方法を選ぶ 検討.html」（デザイン未確定と明記されたプレースホルダー）をそのまま
// 実装した画面。カレンダーの「今日・記録なし」パネルの「トレーニングを開始」ボタンから遷移する。
// 4択のうち「自分で選ぶ」「ルーティン」だけが現状実装可能（履歴から新規セッションを始める導線・
// おすすめメニュー機能自体が未実装のため）。動かないカードを隠さずdisabled+「準備中」表示にするのは、
// 4択のレイアウト自体はデザイン案を維持しつつ、将来の実装場所を示すための意図的な判断（要件確認済み）。
//
// 2026-07-20: カレンダーの過去日パネル「記録を追加」からもpastDateKey付きでこの画面へ遷移してくる
// （要件確認済み: 今日と同じ選択画面を経由させ、選んだ後だけ着地先を変える）。この場合、
// 「自分で選ぶ」「ルーティン」の選択結果は生きたトレーニング(endedAtがnull)ではなく、
// startedAt=endedAt=pastDateKeyの完了済みセッションとして作成する。app/workout/[id].tsxは
// endedAt済みのセッションを自動的に「記録の編集」モード（タイマー非表示）で開くため、
// 遷移先自体は同じ/workout/{id}のままでよい
export default function StartChooserScreen() {
  const { pastDateKey } = useLocalSearchParams<{ pastDateKey?: string }>();
  const isPastMode = isValidDateKey(pastDateKey);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  // 「自分で選ぶ」は種目0件のまま/workout/{id}へ着地させず、種目追加ピッカーへ直接進める
  // （2026-07-20、要件確認済み）。/workout/{id}をpushしてから種目追加ピッカーをさらにpushする
  // 2段階の実装は、1タップで2回連続のスライドイン遷移が走る目に見える不具合になっていた
  // （@designer指摘）ため、/workout/{id}を経由せず直接種目追加ピッカーへ遷移し、確定後は
  // app/workout/exercise-picker.tsxのnewSessionパラメータで、確定後にdismiss(2)
  // （この画面(start-chooser)+exercise-picker自身を閉じる）してからpushして/workout/{id}へ
  // 差し込む方式にした（router.back()だとこの画面に戻ってしまうため使えない。2026-07-22、
  // @ユーザー指摘: 当初はreplaceだったが、それだとstart-chooserがスタックに残ったままになり
  // /workout/{id}側の「戻る」ボタンで呼び出し元まで戻れない不具合があった）
  const startWorkout = useWorkoutStarter((sessionId) =>
    pushDebounced({ pathname: '/workout/exercise-picker', params: { sessionId: String(sessionId), newSession: '1' } }),
  );

  // この画面は「進行中セッションが無い」ことを呼び出し元（カレンダーのhandleStartToday）が
  // 保証した上でのみ遷移してくる前提で、ここではactiveSessionの有無を再チェックしない
  // （index.tsx・routine/index.tsxのように複数経路から到達し得る画面ではないため）。
  // 将来この画面が他の入口からも開かれるようになった場合は、ここにもactiveSession分岐が必要になる。
  // pastDateKeyモードでも同様に「進行中セッションと競合しない」（endedAtが最初から入っており
  // activeSessionとして拾われないため）ため、この前提のままでよい
  const handlePickManually = useCallback(() => {
    if (isPastMode) {
      startWorkout(async () => (await createPastWorkoutSession(dateKeyToNoonMs(pastDateKey!))).id);
      return;
    }
    startWorkout(async () => (await startWorkoutSession()).id);
  }, [isPastMode, pastDateKey, startWorkout]);

  // app/routine/index.tsx（フルCRUD一覧）ではなく、「選ぶだけ」の専用ピッカー画面
  // (app/workout/start-routine-picker.tsx)を使う（2026-07-20、要件確認済み: 編集・複製・
  // 削除・並び替えが同居する一覧を選択操作に使うと誤操作リスクがあるため、当初は過去日限定で
  // 置き換えたが、今日のライブ開始でも同じ理由で統一した）。過去日モードのときだけ
  // pastDateKeyを引き継ぐ
  const handlePickRoutine = useCallback(() => {
    pushDebounced({
      pathname: '/workout/start-routine-picker',
      params: isPastMode ? { pastDateKey: pastDateKey! } : {},
    });
  }, [isPastMode, pastDateKey, pushDebounced]);

  // カレンダー画面から遷移する限り不正なpastDateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-routine-picker.tsxと同じ方針）。isPastMode自体が
  // isValidDateKeyの結果のため、ここでは再評価せずisPastModeを再利用する（@reviewer指摘）
  if (pastDateKey !== undefined && !isPastMode) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'どう記録する？' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  // ヘッダーサブタイトル・VoiceOverヒントの両方で使うため1回だけ計算する
  const pastDateLabel = isPastMode ? formatSessionDateGroup(dateKeyToNoonMs(pastDateKey!)) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {isPastMode && (
        <Stack.Screen
          options={{
            headerTitle: () => <HeaderTitle title="どう記録する？" subtitle={pastDateLabel!} />,
          }}
        />
      )}
      <View style={styles.grid}>
        <View style={styles.row}>
          <StartMethodCard icon="sparkles" label="おすすめメニュー" disabled />
          <StartMethodCard icon="clock.arrow.circlepath" label="履歴から" disabled />
        </View>
        <View style={styles.row}>
          <StartMethodCard
            icon="dumbbell.fill"
            label="自分で選ぶ"
            onPress={handlePickManually}
            hint={pastDateLabel ? `${pastDateLabel}の記録として追加します` : undefined}
          />
          <StartMethodCard
            icon="list.bullet"
            label="ルーティン"
            onPress={handlePickRoutine}
            hint={pastDateLabel ? `${pastDateLabel}の記録として追加します` : undefined}
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
