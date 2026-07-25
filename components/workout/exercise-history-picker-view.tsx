import { DesignIcon } from '@/components/ui/design-icon';
import { HeaderTitle } from '@/components/ui/header-title';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { HistoryEntryCard } from '@/components/workout/history-entry-card';
import { Colors, ScreenStyles, Typography } from '@/constants/theme';
import { useExercise } from '@/hooks/use-exercises';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { computePersonalBestIds, getExerciseHistoryEntries, type HistoryEntry } from '@/lib/workout/history';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { formatSessionDateGroup, toMonthSections } from '@/lib/workout/summary';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  exerciseId: number;
  // ヘッダーのサブタイトルに出す。種目自体はこのコンポーネントもuseExerciseで引いているが、
  // それはlive queryのため初回描画では未解決で、待つとサブタイトルが一瞬空になる。
  // 呼び出し元がparamsで既に持っている名前をそのまま渡してもらいちらつきを避ける
  exerciseName: string;
  // 実績集計から除外するセッション。トレーニング中は「今まさに読み込もうとしている自分自身」を
  // 除外し、ルーティン編集には進行中セッションの概念が無いためNO_SESSION_TO_EXCLUDEを渡す
  excludeSessionId: number;
  // 読み込み先に既に確定済みの値があるか。無ければ失われるものが無いので確認ダイアログを省く
  hasRecordedData: boolean;
  // 確認ダイアログの本文。「入力済みの記録」(トレーニング中)/「設定済みのセット内容」
  // (ルーティン編集)など、失われる対象の呼び方が呼び出し元の文脈で違うため引数化する
  confirmMessage: string;
  // 過去の記録が0件だったときの空状態から戻る導線。現状の呼び出し元は2つともrouter.back()だが、
  // ExerciseReorderView・RoutinePickerListで確立したprop方式に揃えている
  // (SessionHistoryPickerView系は内部でuseRouterする別流儀のままで、統一は別タスク)
  onPressBack: () => void;
  // 実際の読み込み(DB書き込み/ルーティン下書き配列の更新)と成功時のrouter.back()は呼び出し側の責務。
  // 失敗時はthrowするだけでよく、二重送信防止・読み込み中表示・エラーAlertはこのコンポーネントが担う。
  // 中身が同期処理(ルーティンの下書き更新)でもasyncで宣言する。ExerciseSwapPicker・RoutineLoadView・
  // SessionHistoryLoadViewのonSubmitと契約を揃えるためで、既存のルーティン側の画面も同じ書き方をしている
  // (@reviewer指摘: ここだけvoid|Promise<void>のunionにすると契約に穴が開く)
  onLoad: (entry: HistoryEntry) => Promise<void>;
};

// app/workout/history-picker.tsx(トレーニング中のセットへ読み込む)・
// app/routine/history-picker.tsx(ルーティンのテンプレートセットへ読み込む)で共有する
// 「過去の記録から読み込み」選択画面の本体。取得の3状態管理(読み込み中/失敗/成功)・自己ベスト判定・
// 月グルーピング・注意バナー・確認ダイアログ・エラーハンドリングは完全に共通で、実際にどこへ
// 反映するかだけが呼び出し元ごとに異なる。
// セッション単位で選ぶ方(SessionHistoryPickerView)とは別物で、こちらは種目1つに対する
// 過去の実績一覧から1日分を選ぶ画面
export function ExerciseHistoryPickerView({
  exerciseId,
  exerciseName,
  excludeSessionId,
  hasRecordedData,
  confirmMessage,
  onPressBack,
  onLoad,
}: Props) {
  const { exercise } = useExercise(exerciseId);
  const isLoadingRef = useRef(false);
  // 読み込み中のカードだけボタンを無効化するため、真偽値ではなく対象カードのidで持つ
  // （真偽値だと押していない他のカードまで一律グレーアウトし、どれを押したか分からなくなるため）
  const [loadingCardId, setLoadingCardId] = useState<number | null>(null);

  const measurementType = resolveMeasurementType(exercise?.measurementType);
  const columns = MEASUREMENT_COLUMNS[measurementType];

  // null=読み込み中、'error'=取得失敗（「記録が無い」と区別してエラー表示する）、配列=取得成功（0件含む）
  const [entries, setEntries] = useState<HistoryEntry[] | 'error' | null>(null);
  const fetchEntries = useCallback(() => {
    let cancelled = false;
    setEntries(null);
    getExerciseHistoryEntries(exerciseId, excludeSessionId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((e) => {
        console.error('[exercise history]', e);
        if (!cancelled) setEntries('error');
      });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, excludeSessionId]);
  useEffect(() => fetchEntries(), [fetchEntries]);

  const loadedEntries = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);
  const bestIds = useMemo(
    () => computePersonalBestIds(loadedEntries, measurementType),
    [loadedEntries, measurementType],
  );
  const sections = useMemo(() => toMonthSections(loadedEntries), [loadedEntries]);

  const runLoad = useCallback(
    async (entry: HistoryEntry) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setLoadingCardId(entry.workoutSessionExerciseId);
      try {
        await onLoad(entry);
      } catch (e) {
        console.error('[load exercise history]', e);
        Alert.alert('エラー', '記録を読み込めませんでした。');
      } finally {
        isLoadingRef.current = false;
        setLoadingCardId(null);
      }
    },
    [onLoad],
  );

  const handleLoad = useCallback(
    (entry: HistoryEntry) => {
      // まだ何も確定していない読み込み先（空欄のまま、または前回値のプリフィルを未確認）への
      // 読み込みは失われるものが無いため確認なしで即実行する。既に確定済みの値があるときだけ、
      // 上書きされることを確認する（種目入れ替え時の確認要否と同じ考え方）
      if (!hasRecordedData) {
        runLoad(entry);
        return;
      }
      const dateLabel = formatSessionDateGroup(entry.startedAt);
      Alert.alert(`${dateLabel}の記録を読み込みますか？`, confirmMessage, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '読み込む', style: 'destructive', onPress: () => runLoad(entry) },
      ]);
    },
    [hasRecordedData, confirmMessage, runLoad],
  );

  return (
    // 2画面ともCLAUDE.mdの分類でいう「フロー内の中間画面」でルートStack上にあるため
    // edgesは['bottom']で固定してよい(ExerciseReorderViewと同じ判断)。タブ配下に置く画面が
    // 増えた場合は、タブバーが下端を占有するのでedges={[]}が必要になる
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="過去の記録から読み込み" subtitle={exerciseName} />,
        }}
      />
      {Array.isArray(entries) && entries.length > 0 && (
        <View style={styles.banner}>
          <DesignIcon name="assignment" size={16} color={Colors.accent} />
          <Text style={styles.bannerText}>
            選んだ日の記録が<Text style={styles.bannerTextBold}>現在のセットに置き換わります</Text>
          </Text>
        </View>
      )}

      {entries === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchEntries}
        />
      ) : Array.isArray(entries) && entries.length === 0 ? (
        <NotFoundState
          message="この種目の過去の記録がまだありません"
          actionLabel="戻る"
          onPressAction={onPressBack}
        />
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.workoutSessionExerciseId)}
          renderItem={({ item }) => (
            // 他の一覧(RoutinePickerList・ExerciseSwapPicker等)と同じく、1行の描画例外で画面全体を
            // 落とさないよう行単位で囲う。formatHistorySetSummaryは想定外のDB値で投げうる
            <ListErrorBoundary>
              <HistoryEntryCard
                entry={item}
                columns={columns}
                isBest={bestIds.has(item.workoutSessionExerciseId)}
                disabled={loadingCardId != null}
                loading={loadingCardId === item.workoutSessionExerciseId}
                onLoad={handleLoad}
              />
            </ListErrorBoundary>
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthLabelWrapper}>
              <Text style={styles.monthLabel}>{section.title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, ...Typography.footnote, color: Colors.textMuted },
  bannerTextBold: { fontWeight: '700', color: Colors.textSecondary },

  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  // スクロール中はスティッキーヘッダーとして画面上部に固定表示される。marginHorizontalで
  // contentの左右paddingを打ち消して画面端まで塗りつぶすことで、背面のカードが透けて
  // 文字と重なって見えないようにする（背景を不透明にするのが目的で、marginBottom分は
  // paddingBottomに置き換えている）
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
});
