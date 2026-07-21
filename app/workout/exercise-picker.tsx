import { NotFoundState } from '@/components/ui/not-found-state';
import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addExercisesToSession } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// start-chooser「自分で選ぶ」経由のnewSession確定時にdismissする段数。
// スタックは常にcalendar/記録タブ(0)→start-chooser(+1)→この画面自身(+1)の2段
// （start-chooserはapp/(tabs)/index.tsx・app/(tabs)/calendar.tsxの2画面からしかpushされず、
// このnewSession経路はstart-chooserからのみ到達するため、常にこの深さで固定できる。
// @reviewer指摘: マジックナンバーのままだと将来別の深さから開かれるようになった場合に
// 静かに誤動作するため、根拠をここに明記しておく）
const START_CHOOSER_DISMISS_COUNT = 2;

export default function ExercisePickerScreen() {
  // newSessionは、start-chooser「自分で選ぶ」から作成直後のセッションで直接この画面へ
  // 遷移してきた場合にのみ付く（2026-07-20）。この経路では/workout/{id}を一度もpushして
  // いないため、確定後はrouter.back()ではなく/workout/{id}へ差し込む必要がある
  // （通常経路＝[id].tsxのAddExerciseButton/⋮メニュー経由では既に/workout/{id}がスタックに
  // 積まれているため、従来通りbackで戻る）。以前はreplaceしていたが、それだと呼び出し元の
  // start-chooserがスタックに残ったままになり、[id].tsx側の「戻る」ボタン
  // （過去記録編集モード、2026-07-22追加）を押すとカレンダーではなくstart-chooserに
  // 着地してしまう不具合があった（@ユーザー指摘）。dismiss(2)でstart-chooser+この画面自身を
  // まとめて閉じてからpushすることで、[id].tsxからのbackが呼び出し元（カレンダー/記録タブ）へ
  // 正しく戻るようにする（app/calendar/schedule-time-picker.tsxのfinishNavigationと同じ方針）
  const { sessionId: sessionIdParam, newSession } = useLocalSearchParams<{
    sessionId: string;
    newSession?: string;
  }>();
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
      // sessionIdが不正(NaN)ならNotFoundState分岐で早期returnしておりExercisePickerView自体が
      // 描画されないため、この関数がonConfirmとして呼ばれる時点でsessionIdは必ず有限
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      try {
        const prefilled = await addExercisesToSession(sessionId, selectedIds);
        // newSession経路は/workout/{id}が未マウントのため、ここでのnotifyPrefilledは
        // 購読者不在で無視される（ゴースト表示・新規カードへの自動フォーカスは効かないが、
        // 種目・セット自体はDBに保存済みで、/workout/{id}側のlive queryには通常通り反映される）
        notifyPrefilled(prefilled);
        if (newSession === '1') {
          router.dismiss(START_CHOOSER_DISMISS_COUNT);
          pushDebounced(`/workout/${sessionId}`);
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
    [sessionId, router, newSession, pushDebounced],
  );

  if (!Number.isFinite(sessionId)) {
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
        excludeSessionId={sessionId}
        onPressInfo={handlePressInfo}
        onConfirm={handleConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
