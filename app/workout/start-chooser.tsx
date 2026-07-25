import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { StartMethodRow } from '@/components/workout/start-method-row';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { dateKeyToNoonMs, isValidDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 「トレーニング開始選択画面 デザイン案.html」（案06 説明つきリスト）を実装した画面。
// カレンダーの「今日・記録なし」パネルの「トレーニングを開始」ボタンから遷移する。
// 2026-07-25にデザインが確定し、2×2グリッド4択（うち「おすすめメニュー」「履歴から」は
// disabledのプレースホルダー）から、実装済みの3択だけを並べた縦リストへ差し替えた。
//
// この画面自体はDBに触れない。3択のいずれもタップした時点ではセッションを作らず、子画面で
// 内容を確定した時点で初めて作る（2026-07-25、@ユーザー指摘: 以前は「種目を追加」「過去の記録」が
// タップ直後に空セッションを作っていたため、子画面で戻ると空の記録が残ってしまっていた）。
// セッション作成はlib/workout/start-chooser-session.tsに集約している。
//
// 2026-07-20: カレンダーの過去日パネル「記録を追加」からもpastDateKey付きでこの画面へ遷移してくる
// （要件確認済み: 今日と同じ選択画面を経由させ、選んだ後だけ着地先を変える）。この場合、
// どの選択肢を選んだ場合も、結果は生きたトレーニング(endedAtがnull)ではなく、
// startedAt=endedAt=pastDateKeyの完了済みセッションとして作成する。app/workout/[id].tsxは
// endedAt済みのセッションを自動的に「記録の編集」モード（タイマー非表示）で開くため、
// 遷移先自体は同じ/workout/{id}のままでよい
export default function StartChooserScreen() {
  const { pastDateKey } = useLocalSearchParams<{ pastDateKey?: string }>();
  const isPastMode = isValidDateKey(pastDateKey);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  // 「種目を追加」「過去の記録」はどちらも、まだ存在しないセッションに対する子画面を開く。
  // newSession=1が「この経路ではsessionIdがまだ無い（確定時に作る）」ことを表す目印で、
  // 子画面はこれを見てセッション作成・確定後の閉じ方を切り替える。過去日モードのときだけ
  // pastDateKeyも引き継ぎ、確定時にどちらのセッションを作るかを子画面側で判断できるようにする
  const openNewSessionScreen = useCallback(
    (pathname: '/workout/exercise-picker' | '/workout/session-history-picker') => {
      pushDebounced({
        pathname,
        params: { newSession: '1', ...(isPastMode ? { pastDateKey: pastDateKey! } : {}) },
      });
    },
    [pushDebounced, isPastMode, pastDateKey],
  );

  // 種目0件のまま/workout/{id}へ着地させず、種目追加ピッカーへ直接進める（2026-07-20、
  // 要件確認済み）。/workout/{id}をpushしてから種目追加ピッカーをさらにpushする2段階の実装は、
  // 1タップで2回連続のスライドイン遷移が走る目に見える不具合になっていた（@designer指摘）
  const handleAddExercises = useCallback(
    () => openNewSessionScreen('/workout/exercise-picker'),
    [openNewSessionScreen],
  );

  // トレーニング画面ヘッダー⋮の「過去の記録から読み込み」と同じ画面
  // (app/workout/session-history-picker.tsx)へ遷移する（2026-07-25、デザイン確定）。
  // あちらは既存セッションに種目を足す導線だが、こちらはセッションがまだ無い状態で同じ画面を開く
  const handlePickHistory = useCallback(
    () => openNewSessionScreen('/workout/session-history-picker'),
    [openNewSessionScreen],
  );

  // app/routine/index.tsx（フルCRUD一覧）ではなく、「選ぶだけ」の専用ピッカー画面
  // (app/workout/start-routine-picker.tsx)を使う（2026-07-20、要件確認済み: 編集・複製・
  // 削除・並び替えが同居する一覧を選択操作に使うと誤操作リスクがあるため、当初は過去日限定で
  // 置き換えたが、今日のライブ開始でも同じ理由で統一した）。あちらは元々ルーティンを選んだ時点で
  // セッションを作るため、この画面では何もしない
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
  const pastDateHint = pastDateLabel ? `${pastDateLabel}の記録として追加します` : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {isPastMode && (
        <Stack.Screen
          options={{
            headerTitle: () => <HeaderTitle title="どう記録する？" subtitle={pastDateLabel!} />,
          }}
        />
      )}
      <View style={styles.list}>
        <StartMethodRow
          icon="add"
          label="種目を追加"
          description="好きな種目を選んで開始"
          onPress={handleAddExercises}
          hint={pastDateHint}
        />
        <StartMethodRow
          icon="repeat"
          label="ルーティン"
          description="登録したメニューから開始"
          onPress={handlePickRoutine}
          hint={pastDateHint}
        />
        <StartMethodRow
          icon="history"
          label="過去の記録"
          description="過去の履歴と同じ内容で開始"
          onPress={handlePickHistory}
          hint={pastDateHint}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { paddingHorizontal: 16, paddingTop: 14, gap: 11 },
});
