import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HeaderTitle } from '@/components/ui/header-title';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { CommunityMessageCard } from '@/components/workout/community-message-card';
import { RoutineSavePromptCard } from '@/components/workout/routine-save-prompt-card';
import { RoutineUpdatePromptCard } from '@/components/workout/routine-update-prompt-card';
import { SummaryExerciseChart } from '@/components/workout/summary-exercise-chart';
import { SummaryExerciseList } from '@/components/workout/summary-exercise-list';
import { SessionSummaryStats } from '@/components/workout/session-summary-stats';
import { ScreenStyles } from '@/constants/theme';
import { useSessionExerciseCards } from '@/hooks/use-session-exercise-cards';
import { useRoutineSavePrompt } from '@/hooks/use-routine-save-prompt';
import { useRoutineUpdatePrompt } from '@/hooks/use-routine-update-prompt';
import { useSessionTotal, useSessionWeekOrdinal } from '@/hooks/use-session-summary';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import { toChartExercises } from '@/lib/workout/chart-exercises';
import { PLACEHOLDER_COMMUNITY_MESSAGE } from '@/lib/workout/community-message';
import { formatSessionDateGroup, formatSessionDurationLong } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * トレーニング完了サマリー。トレーニング中画面で「終了」を押すと、その画面を **replaceして**
 * この画面に着地する。記録編集はここから push する寄り道、という関係。
 *
 * 逆（トレーニング中画面の上にサマリーをpush）にしてはいけない。サマリーの戻るがpopになり、
 * 記録編集へ降りた時点でサマリーがスタックから消えるため、記録編集の「戻る」がサマリーではなく
 * タブまで抜けてしまう（@ユーザー指摘、実機で確認）。
 *
 * **この画面からは戻れない。** 下に積まれているのはタブで、トレーニング中画面はreplaceで
 * 既に消えている＝戻る先が無いため、ヘッダー左のシェブロンもスワイプバックも持たせない。
 * 離脱はフッターの「閉じる」に一本化する。記録編集への導線はヘッダー右の⋮メニューへ
 * （副次操作を⋮にまとめるのは種目詳細・記録編集と同じ扱い）。
 *
 * 記録編集への導線に「戻る」というラベルを使わないこと。トレーニングの再開（endedAtをnullに
 * 戻す）と読まれるが、endWorkoutSessionは予定(scheduledWorkouts)の削除まで済ませており
 * 巻き戻せない。詳細は lib/workout/session.ts の discardSession のコメントを参照。
 */
export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const parsedId = Number(id);
  const sessionId = Number.isFinite(parsedId) ? parsedId : null;
  const { session, loaded } = useWorkoutSession(sessionId ?? -1);
  const { total } = useSessionTotal(sessionId ?? -1);
  const weekOrdinal = useSessionWeekOrdinal(session?.startedAt ?? null);
  // 一覧・自己ベスト・前回比較はカレンダーの選択日パネルと同じ取得を使う（対象が1件なだけ）。
  // 記録編集から戻ったときに再取得されるのもフック側の担当
  const sessionsForCards = useMemo(
    () => (session ? [{ id: session.id, startedAt: session.startedAt }] : []),
    [session],
  );
  const { cards, retry: retryCards } = useSessionExerciseCards(sessionsForCards);
  // ⋮の項目・本文カード・保存の遷移をまとめて持つ（判定と下書きの積み方はフック側）。
  // 保存（フリー開始）と更新（ルーティン開始）は排他で、同時に出ることはない
  const { canSaveAsRoutine, showPrompt: showSavePrompt, saveAsRoutine, dismissPrompt: dismissSavePrompt } =
    useRoutineSavePrompt(session, cards);
  const {
    canUpdateRoutine,
    showPrompt: showUpdatePrompt,
    routineName,
    summary: diffSummary,
    openDiffScreen,
    dismissPrompt: dismissUpdatePrompt,
  } = useRoutineUpdatePrompt(session);
  // グラフは種目単位で切り替える（同じ種目の2枚目は同じ絵になるので畳む）
  const chartExercises = useMemo(() => (Array.isArray(cards) ? toChartExercises(cards) : []), [cards]);

  // 記録編集画面の⋮「削除」は deleteSession → router.back() なので、サマリーから開いていると
  // 削除済みセッションのサマリーへ戻ってくる。NotFoundStateを見せる場面ではない（ユーザーは
  // 自分で消したばかりで、サマリーに用は無い）ため、検知したらそのままタブまで畳む。
  // idが数値でない場合も同じ扱いにする——このルートは終了処理からしか開かれず、
  // 手打ちのURLに丁寧なエラー画面を用意する意味が無い
  const isGone = sessionId == null || (loaded && !session);
  useEffect(() => {
    if (isGone) router.dismissAll();
  }, [isGone, router]);

  // 「閉じる」は元いたタブへ戻す。記録タブから始めたか、カレンダーの予定から始めたかで
  // 着地するタブを変えないため、タブ切り替えを伴わない dismissAll を使う
  // （dismissToはスタックのpopのみでタブ切り替えには効かない、app/_layout.tsx参照）。
  // dismiss(N)ではなくdismissAllなのは、トレーニング画面への入口が複数あってスタックの
  // 深さが経路ごとに違うため（lib/workout/start-chooser-navigation.tsのdismiss数え上げが
  // fromChild/fromGrandchildの2種類に割れているのと同じ事情）
  const handleClose = () => router.dismissAll();

  // 記録編集はこの画面の上にpushする。編集画面側は経路を知る必要がない——戻る先が
  // サマリーか記録タブかは、そのときスタックの下に居る画面がそのまま答えになる
  const handleEdit = () => {
    if (sessionId == null) return;
    router.push(`/workout/${sessionId}`);
  };

  // この記録に対する副次操作は⋮に集約する。ヘッダー左に戻るシェブロンを置いて編集へ入る形は
  // 採らない——下に積まれているのはタブなので、シェブロンは「戻る」ではなく前に進む遷移になり、
  // 記号と動きが食い違う（@ユーザー指摘、実機で確認）。
  // 将来はSNS共有が同じメニューに並ぶ予定。フッターにサブ導線を置く案（主ボタンの下のリンク）
  // だと、⋮が増えた時点で副次操作の入口が2箇所に割れるため、最初から最終形の器にしている。
  // 「記録を削除」は入れない（記録編集画面の⋮に既にあり、祝いの導線に破壊的操作を混ぜると
  // 「記録を編集」との誤タップコストが上がるため。2026-08-06判断）
  const menuItems: DropdownMenuItem[] = [
    { key: 'edit', label: '記録を編集', icon: 'edit', onPress: handleEdit },
  ];
  if (canSaveAsRoutine) {
    menuItems.push({
      key: 'save-routine',
      label: 'ルーティンとして保存',
      icon: 'repeat',
      onPress: saveAsRoutine,
    });
  }
  if (canUpdateRoutine) {
    menuItems.push({
      key: 'update-routine',
      label: 'ルーティンを更新',
      icon: 'repeat',
      onPress: openDiffScreen,
    });
  }

  if (!session) return null;

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title="トレーニング完了" subtitle={formatSessionDateGroup(session.startedAt)} />
          ),
          // ルートStackが全画面に配るHeaderBackButton（自前のシェブロン）を止める
          headerLeft: () => null,
          // headerLeftを空にしただけではネイティブの戻るボタンが残る。native-stackでは
          // 自前のheaderLeftとネイティブの戻るボタンが別管理で、後者はこちらで消す
          // （headerLeftがnullを返すと「headerLeftを指定していない」のと同じ扱いになり、
          // ネイティブ側が表に出てくる。実機で確認）
          headerBackVisible: false,
          // 戻る導線を持たない画面なので、同じことをするスワイプバックも止める。
          // 残しておくと「戻れる画面」に見えるが、戻った先はタブ＝「閉じる」と同じで、
          // 記号（戻る）と結果（閉じる）が食い違う
          gestureEnabled: false,
          headerRight: () => (
            <HeaderMenu groups={[menuItems]} accessibilityLabel="この記録のメニューを開く" />
          ),
        }}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SessionSummaryStats
          // 所要時間はendedAt基準の確定値。サマリーを開いている間に伸びることは無いので
          // now基準のフォールバック（進行中セッション用）には落ちない
          duration={formatSessionDurationLong(session.startedAt, session.endedAt)}
          total={total}
          weekOrdinal={weekOrdinal}
        />
        <CommunityMessageCard message={PLACEHOLDER_COMMUNITY_MESSAGE} />
        <SummaryExerciseChart exercises={chartExercises} horizontalInset={BODY_HORIZONTAL_PADDING} />
        {/* どのカードを押しても行き先は同じ記録編集画面。押した種目までスクロールさせる案は
            バックログ送りにしてあるため、onPressExerciseが渡すカードはここでは使わない */}
        <SummaryExerciseList
          cards={cards}
          onPressExercise={handleEdit}
          onRetry={retryCards}
        />
        {/* 種目一覧の下＝「今日やった構成」を見終わった直後に置く（デザイン案の採用案）。
            数値やグラフの間に挟むと、成果を見る流れをセールスが断ち切る形になる */}
        {showSavePrompt && <RoutineSavePromptCard onSave={saveAsRoutine} onDismiss={dismissSavePrompt} />}
        {showUpdatePrompt && routineName != null && (
          <RoutineUpdatePromptCard
            routineName={routineName}
            summary={diffSummary}
            onConfirm={openDiffScreen}
            onDismiss={dismissUpdatePrompt}
          />
        )}
      </ScrollView>

      <ScreenFooter>
        <PrimaryButton label="閉じる" onPress={handleClose} />
      </ScreenFooter>
    </SafeAreaView>
  );
}

// グラフブロックが「画面端までスワイプを拾う」ために同じ値を必要とするため定数にする
const BODY_HORIZONTAL_PADDING = 16;

const styles = StyleSheet.create({
  body: { flex: 1 },
  // ブロック間の縦の間隔はデザイン案指定の12px
  bodyContent: {
    paddingHorizontal: BODY_HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
});
