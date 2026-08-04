import { HeaderBackButton } from '@/components/ui/header-back-button';
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
 * トレーニング完了サマリー。トレーニング中画面で「終了」を押すと、その画面を **replaceして**
 * この画面に着地する。記録編集はここから push する寄り道、という関係。
 *
 * 逆（トレーニング中画面の上にサマリーをpush）にしてはいけない。サマリーの戻るがpopになり、
 * 記録編集へ降りた時点でサマリーがスタックから消えるため、記録編集の「戻る」がサマリーではなく
 * タブまで抜けてしまう（@ユーザー指摘、実機で確認）。
 *
 * 下に積まれているのはタブなので、ヘッダーのシェブロンは「1つ戻る」ではなく記録編集へのpush。
 * スワイプバックだけがタブへ抜けて挙動が食い違うため、この画面ではジェスチャを無効にしている。
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

  // 記録編集はこの画面の上にpushする。fromを渡すのは、記録編集画面が「サマリーへ帰る寄り道」
  // として振る舞う（フッターを「完了」にし、シェブロンを出さない）ために経路を知る必要があるため。
  // 記録タブのセッションカードから開いた場合は従来通りの編集画面のままにする
  const handleEdit = () => {
    if (sessionId == null) return;
    router.push({ pathname: '/workout/[id]', params: { id: String(sessionId), from: 'summary' } });
  };

  if (!session) return null;

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle title="トレーニング完了" subtitle={formatSessionDateGroup(session.startedAt)} />
          ),
          headerLeft: ({ tintColor }) => (
            <HeaderBackButton tintColor={tintColor} onPress={handleEdit} accessibilityLabel="記録を編集する" />
          ),
          // シェブロンが記録編集へ「進む」のに対し、スワイプバックは下のタブへ抜けてしまい
          // 挙動が食い違う。達成感を締めくくる画面でもあるので、離脱は「閉じる」に一本化する
          gestureEnabled: false,
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
