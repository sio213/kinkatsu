import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HeaderTitle } from '@/components/ui/header-title';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { CommunityMessageCard } from '@/components/workout/community-message-card';
import { SummaryExerciseChart } from '@/components/workout/summary-exercise-chart';
import { SummaryExerciseList } from '@/components/workout/summary-exercise-list';
import { SessionSummaryStats } from '@/components/workout/session-summary-stats';
import { ScreenStyles } from '@/constants/theme';
import { useSessionExerciseCards } from '@/hooks/use-session-exercise-cards';
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
 * 下に積まれているのはタブなので、ヘッダー左にシェブロンは置かない。記録編集への導線は
 * ヘッダー右の⋮メニューに集約する（副次操作を⋮にまとめるのは種目詳細・記録編集と同じ扱い）。
 * スワイプバックは下のタブへ抜ける＝「閉じる」と同義なので、そのまま有効にしている。
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
  // 当面は「記録を編集」1項目だけだが、SNS共有・ルーティンとして登録が同じメニューに並ぶ予定。
  // フッターにサブ導線を置く案（主ボタンの下のリンク）だと、⋮が増えた時点で副次操作の入口が
  // 2箇所に割れるため、最初から最終形の器にしている
  const menuItems: DropdownMenuItem[] = [
    { key: 'edit', label: '記録を編集', icon: 'edit', onPress: handleEdit },
  ];

  if (!session) return null;

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title="トレーニング完了" subtitle={formatSessionDateGroup(session.startedAt)} />
          ),
          // ルートStackが全画面に配るHeaderBackButtonを止める。canGoBack()は真（下にタブ）なので、
          // 明示的に空にしないとタブへ抜けるだけのシェブロンが出てしまう
          headerLeft: () => null,
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
        <SummaryExerciseChart exercises={chartExercises} />
        {/* どのカードを押しても行き先は同じ記録編集画面。押した種目までスクロールさせる案は
            バックログ送りにしてあるため、onPressExerciseが渡すカードはここでは使わない */}
        <SummaryExerciseList
          cards={cards}
          onPressExercise={handleEdit}
          onRetry={retryCards}
        />
      </ScrollView>

      <ScreenFooter>
        <PrimaryButton label="閉じる" onPress={handleClose} />
      </ScreenFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  // ブロック間の縦の間隔はデザイン案指定の12px
  bodyContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 },
});
