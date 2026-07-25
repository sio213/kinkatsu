import { NotFoundState } from '@/components/ui/not-found-state';
import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addExercisesToSession } from '@/lib/workout/session';
import { createStartChooserSession } from '@/lib/workout/start-chooser-session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// start-chooser「種目を追加」経由のnewSession確定時にdismissする段数。
// スタックは常にcalendar/記録タブ(0)→start-chooser(+1)→この画面自身(+1)の2段
// （start-chooserはapp/(tabs)/(record)/index.tsx・app/(tabs)/calendar.tsxの2画面からしかpushされず、
// このnewSession経路はstart-chooserからのみ到達するため、常にこの深さで固定できる。
// @reviewer指摘: マジックナンバーのままだと将来別の深さから開かれるようになった場合に
// 静かに誤動作するため、根拠をここに明記しておく）
const START_CHOOSER_DISMISS_COUNT = 2;

export default function ExercisePickerScreen() {
  // newSessionは、start-chooser「種目を追加」からこの画面へ直接遷移してきた場合にのみ付く
  // （2026-07-20）。この経路ではセッションがまだ存在せず（2026-07-25、@ユーザー指摘: 以前は
  // start-chooser側でタップ直後に作っていたが、ここで「戻る」を押すと空の記録が残ってしまうため、
  // 確定時に作るよう変更した）、確定時にcreateStartChooserSessionで作ってから種目を追加する。
  // また/workout/{id}を一度もpushしていないため、確定後はrouter.back()ではなく/workout/{id}へ
  // 差し込む必要がある（通常経路＝[id].tsxのAddExerciseButton/⋮メニュー経由では既に/workout/{id}が
  // スタックに積まれているため、従来通りbackで戻る）。以前はreplaceしていたが、それだと呼び出し元の
  // start-chooserがスタックに残ったままになり、[id].tsx側の「戻る」ボタン
  // （過去記録編集モード、2026-07-22追加）を押すとカレンダーではなくstart-chooserに
  // 着地してしまう不具合があった（@ユーザー指摘）。dismiss(2)でstart-chooser+この画面自身を
  // まとめて閉じてからpushすることで、[id].tsxからのbackが呼び出し元（カレンダー/記録タブ）へ
  // 正しく戻るようにする（app/calendar/schedule-time-picker.tsxのfinishNavigationと同じ方針）。
  // pastDateKeyはnewSession経路でのみ付き、作るセッションの種類（過去日の完了済み/今日のライブ）を決める
  const {
    sessionId: sessionIdParam,
    newSession,
    pastDateKey,
  } = useLocalSearchParams<{
    sessionId?: string;
    newSession?: string;
    pastDateKey?: string;
  }>();
  const isNewSession = newSession === '1';
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const isAddingRef = useRef(false);

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleConfirm = useCallback(
    async (selectedIds: number[]) => {
      // newSession経路以外でsessionIdが不正(NaN)ならNotFoundState分岐で早期returnしており
      // ExercisePickerView自体が描画されないため、この関数がonConfirmとして呼ばれる時点で
      // sessionIdは必ず有限
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      try {
        const targetSessionId = isNewSession ? await createStartChooserSession(pastDateKey) : sessionId;
        // newSession経路は/workout/{id}が未マウントのため、ここでのnotifyPrefilledは
        // 購読者不在で無視される（ゴースト表示・新規カードへの自動フォーカスは効かないが、
        // 種目・セット自体はDBに保存済みで、/workout/{id}側のlive queryには通常通り反映される）
        const prefilled = await addExercisesToSession(targetSessionId, selectedIds);
        notifyPrefilled(prefilled);
        if (isNewSession) {
          router.dismiss(START_CHOOSER_DISMISS_COUNT);
          pushDebounced(`/workout/${targetSessionId}`);
        } else {
          router.back();
        }
      } catch (e) {
        console.error('[add exercises to session]', e);
        Alert.alert('エラー', '種目を追加できませんでした。');
      } finally {
        isAddingRef.current = false;
      }
    },
    [sessionId, isNewSession, pastDateKey, router, pushDebounced],
  );

  if (!isNewSession && !Number.isFinite(sessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ExercisePickerView
        // newSession経路はまだセッションが無いため、実績集計から除外すべき自分自身も存在しない
        excludeSessionId={isNewSession ? undefined : sessionId}
        onPressInfo={handlePressInfo}
        onConfirm={handleConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
