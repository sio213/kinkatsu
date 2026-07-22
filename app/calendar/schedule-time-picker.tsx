import { ScheduleNotifyToggle } from '@/components/calendar/schedule-notify-toggle';
import { FormField } from '@/components/ui/form-field';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { useExercises } from '@/hooks/use-exercises';
import { usePermissionState } from '@/hooks/use-permission-state';
import { formatDirectScheduleTitle } from '@/lib/calendar/schedule';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { ensurePermission } from '@/lib/notifications/permissions';
import { createDirectScheduledWorkout, createScheduledWorkout } from '@/lib/notifications/scheduled-workout-scheduler';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面2（PR10、PR10-5で通知登録を追加、
// 2026-07-20に「直接追加」対応）。時刻はデザイン未確定だったため、
// components/reminders/reminder-form.tsxの時刻入力（iOSは常時インラインspinner、Androidは
// ボタン+モーダル）をベースに踏襲する。デフォルト18:00も
// reminder-form.tsxの新規リマインダーのデフォルトと揃え、アプリ内での「トレーニングの標準時刻」感を
// 一貫させる。ただし水平位置は揃えていない: この画面は時刻ピッカーが唯一の入力項目のため
// 中央寄せにしているが、reminder-form.tsxは他フィールドと縦に並ぶ左寄せ基調のフォームのため
// 左寄せのまま（2026-07-22、@reviewer/@designer指摘でこの差分の理由を明記）
function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

// "1,2,3"形式のexerciseIdsパラメータを検証しつつ配列にする。1件でも不正なidが混ざっていたら
// 直リンク等の異常値とみなし空配列にフォールバックする（1件だけ静かに無視すると選んだ内容と
// 保存内容がズレるため、全体を無効にする方が安全）
function parseExerciseIds(value: string | undefined): number[] {
  if (!value) return [];
  const ids = value.split(',').map(Number);
  return ids.every(isPositiveInteger) ? ids : [];
}

export default function ScheduleTimePickerScreen() {
  const {
    dateKey,
    routineId: routineIdParam,
    routineName,
    exerciseIds: exerciseIdsParam,
  } = useLocalSearchParams<{
    dateKey: string;
    // ルーティン版(schedule-routine-picker経由)はroutineId、直接追加版
    // (schedule-exercise-picker経由)はexerciseIdsのどちらか一方だけが渡る
    routineId?: string;
    routineName?: string;
    exerciseIds?: string;
  }>();
  const { exercises } = useExercises();
  const routineId = Number(routineIdParam);
  const isRoutineMode = isPositiveInteger(routineId);
  const exerciseIds = useMemo(() => parseExerciseIds(exerciseIdsParam), [exerciseIdsParam]);
  const isDirectMode = !isRoutineMode && exerciseIds.length > 0;
  // 直接追加の予定タイトルは選んだ種目名から合成する（ルーティン名に相当するものが無いため）。
  // 選択順(exerciseIds順)を保つため、Map経由でidから名前を引く
  const directTitle = useMemo(() => {
    if (!isDirectMode) return '';
    const nameById = new Map(exercises.map((e) => [e.id, e.name] as const));
    return formatDirectScheduleTitle(exerciseIds.map((id) => nameById.get(id)).filter((n): n is string => n != null));
  }, [isDirectMode, exerciseIds, exercises]);
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  const [permState, setPermState] = usePermissionState();
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(0);
  // うっかりOFFのまま通知が来ない事故を避けるため、デフォルトは必ずON
  // （@pm/@user-advisorレビュー指摘）
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  // isSubmittingRefは連打防止用の同期ガード、こちらはボタンの見た目のフィードバック用
  // (ensurePermission()がOSネイティブの許可ダイアログ応答待ちで数秒ブロックしうるため、
  // 押した直後に何も反応が無く見えるのを防ぐ、@designerレビュー指摘)
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleTimeChange(_: unknown, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidTimePicker(false);
    if (!date) return;
    setHour(date.getHours());
    setMinute(date.getMinutes());
  }

  const timeDate = new Date();
  timeDate.setHours(hour, minute, 0, 0);
  const timeLabel = formatHourMinuteParts(hour, minute);
  const showTimePicker = Platform.OS === 'ios' || showAndroidTimePicker;

  // 通知が届くよう先に権限をリクエストしておくが、拒否/未許可でも予定自体の保存は続ける
  // (リマインダーは権限が無いと保存自体を止めるが、手動予定はカレンダー表示自体に価値があるため
  // 通知はスキップするだけにする、PR10-5計画フェーズの@designer/@planner方針)。
  // ensurePermission()自体が(拒否ではなく)例外を投げた場合でもこの「保存は必ず続ける」方針を
  // 守るため、権限リクエストの失敗はここで握りつぶしcreateScheduledWorkoutへ進む(自動レビュー指摘対応)
  const handleConfirm = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      // 通知トグルがOFFならこの予定は通知しないため、権限リクエスト自体をスキップする。
      // 特にiOSは初回のネイティブ許可ダイアログを一度使うと以後は設定アプリ誘導しか
      // 出せなくなるため、通知する気の無い操作でこの一度きりの機会を消費してしまうのを防ぐ
      // (@reviewer/@tester/@designer全員が独立して指摘した最重要ポイント)
      if (notifyEnabled) {
        try {
          setPermState(await ensurePermission());
        } catch (e) {
          console.error('[ensure permission]', e);
        }
      }
      // 作った予定は、種目は決めたが重量・回数（目標セット）はまだ何も入れていない状態
      // （ルーティン予定も、addScheduledWorkoutがルーティン本体の目標セットをこの予定インスタンス
      // 専用にコピーするようになったPR1以降は同様）のため、このまま選択日パネルへ戻すと再度カードを
      // 探してタップし直す手間が生まれる。選択日パネルでカードをタップした時の遷移先
      // (app/(tabs)/calendar.tsxのhandleEditScheduledWorkoutExercises)と同じく目標セット編集画面
      // (schedule-workout-edit.tsx)が「この予定の唯一の詳細/編集ビュー」であるため、作成直後に
      // そのままそこへ連れて行く（@ユーザー指摘。@designer指摘: 「過去の記録から読み込むフローを
      // 参考に」という当初の説明は、あちらが「既にいた画面へ戻る」のに対しこちらは「新しい画面へ
      // 進む」ため厳密には性質が異なる）。ルーティン予定も直接追加と同じ画面遷移に統一する
      // （PR7、ユーザー確認済み）
      let createdScheduledWorkoutId: number | null = null;
      if (isDirectMode) {
        createdScheduledWorkoutId = await createDirectScheduledWorkout(
          exerciseIds,
          directTitle,
          dateKey,
          hour,
          minute,
          notifyEnabled,
        );
      } else {
        createdScheduledWorkoutId = await createScheduledWorkout(
          routineId,
          routineName ?? '',
          dateKey,
          hour,
          minute,
          notifyEnabled,
        );
      }
      // カレンダーからの3階層（schedule-chooser/schedule-routine-picker or
      // schedule-exercise-picker/この画面）をまとめて閉じる必要がある(app/workout/routine-load.tsxの
      // router.dismiss(2)と同じ考え方だが、schedule-chooserが1枚増えた分+1)
      const dismissCount = 3;
      // dismissしてから、作成した予定（直接追加・ルーティンとも）の目標セット編集画面をpushし直す。
      // dismiss/pushとも同期的にルーターの状態へ反映されるため、この順で呼んでも遷移が競合しない
      // (app/workout/routine-load.tsx等の既存のdismiss(N)単体パターンを拡張したもの)。
      // createdScheduledWorkoutIdはこの時点で必ず非nullだが、型（number | null）に忠実に
      // ガードを残している
      router.dismiss(dismissCount);
      if (createdScheduledWorkoutId != null) {
        router.push({
          pathname: '/calendar/schedule-workout-edit',
          params: { scheduledWorkoutId: String(createdScheduledWorkoutId) },
        });
      }
    } catch (e) {
      console.error('[add scheduled workout]', e);
      Alert.alert('エラー', '予定を追加できませんでした。');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    isDirectMode,
    exerciseIds,
    directTitle,
    routineId,
    routineName,
    dateKey,
    hour,
    minute,
    notifyEnabled,
    router,
    setPermState,
  ]);

  const handleRequestPermission = useCallback(async () => {
    setPermState(await ensurePermission());
  }, [setPermState]);

  // 前画面（schedule-routine-picker.tsxまたはschedule-exercise-picker.tsx）は必ずどちらか一方の
  // 妥当なパラメータ・'YYYY-MM-DD'形式のdateKeyを渡すが、不正な直リンク等への防御として
  // 明示的にガードする（dateKeyが不正なままparseDateKeyに渡るとクラッシュするため）
  if ((!isRoutineMode && !isDirectMode) || !isValidDateKey(dateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '時刻を設定' }} />
        <NotFoundState message="ルーティンが見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          // 画面1(schedule-routine-picker.tsx/schedule-exercise-picker.tsx)はタイトル=アクション名
          // （「ルーティンを選択」等）・サブタイトル=日付という情報階層のため、こちらも合わせて
          // タイトルをアクション名にし、日付はサブタイトル側にまとめる（デザイン指摘:
          // 隣接画面で主従が逆転していると視線移動が不自然になるため）。予定名（ルーティン名/種目名）は
          // 前画面で選んだばかりで直後の画面表示は不要と判断し出さない（@ユーザー指摘）
          headerTitle: () => (
            <HeaderTitle title="時刻を設定" subtitle={formatSessionDateGroup(parseDateKey(dateKey).getTime())} />
          ),
        }}
      />
      <View style={styles.content}>
        {/* 通知トグル→時刻の順（2026-07-22、@ユーザー指摘でこの並びに変更） */}
        <ScheduleNotifyToggle
          enabled={notifyEnabled}
          onToggleEnabled={setNotifyEnabled}
          permState={permState}
          onRequestPermission={handleRequestPermission}
        />
        <FormField label="時刻">
          <View style={styles.timePickerWrapper}>
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowAndroidTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel="時刻を変更"
              >
                <Text style={styles.timeButtonText}>{timeLabel}</Text>
              </TouchableOpacity>
            )}
            {showTimePicker && (
              <DateTimePicker
                value={timeDate}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleTimeChange}
              />
            )}
          </View>
        </FormField>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="この時刻で予定を追加" onPress={handleConfirm} disabled={isSubmitting} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: 16, gap: 16 },
  // 時刻ピッカーが左寄りに見えていた問題の修正（@ユーザー指摘）。iOSのspinnerは意図幅で
  // 描画され親の全幅に伸びないため、このwrapperのalignItems:centerで水平中央に寄せる
  timePickerWrapper: { alignItems: 'center' },
  timeButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeButtonText: { ...Typography.timeDisplay, color: Colors.textPrimary },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
