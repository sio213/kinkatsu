import { HeaderTitle } from '@/components/ui/header-title';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { SessionSummaryStats } from '@/components/workout/session-summary-stats';
import { ScreenStyles } from '@/constants/theme';
import { useSessionTotal, useSessionWeekOrdinal } from '@/hooks/use-session-summary';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import { formatSessionDateGroup, formatSessionDurationLong } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * トレーニング完了サマリー。トレーニング中画面で「終了」を押したあと、その画面の上に
 * pushされる（replaceではない）。真下に残る app/workout/[id].tsx は endedAt が入った
 * ことで「記録の編集」モードになっているため、ヘッダーの戻る・スワイプバックがそのまま
 * 「記録を編集する」導線になり、専用の遷移処理を持たなくて済む。
 *
 * 「戻る」というラベルを使わないこと。トレーニングの再開（endedAtをnullに戻す）と読まれるが、
 * endWorkoutSessionは予定(scheduledWorkouts)の削除まで済ませており巻き戻せない。
 * 詳細は lib/workout/session.ts の discardSession のコメントを参照。
 */
export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const parsedId = Number(id);
  const sessionId = Number.isFinite(parsedId) ? parsedId : null;
  const { session, loaded } = useWorkoutSession(sessionId ?? -1);
  const { total } = useSessionTotal(sessionId ?? -1);
  const weekOrdinal = useSessionWeekOrdinal(session?.startedAt ?? null);

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

  if (!session) return null;

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title="トレーニング完了" subtitle={formatSessionDateGroup(session.startedAt)} />
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
        {/* みんなの声・グラフ・実施した種目はこの下に順次追加する */}
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
