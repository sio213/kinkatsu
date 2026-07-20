import { PermissionBanner } from '@/components/reminders/permission-banner';
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
import { skipReminderOccurrence, unskipReminderOccurrence } from '@/lib/notifications/reminder-skip-scheduler';
import {
  buildScheduledWorkoutFireDate,
  createDirectScheduledWorkout,
  createScheduledWorkout,
} from '@/lib/notifications/scheduled-workout-scheduler';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面2（PR10、PR10-5で通知登録を追加、
// 2026-07-20に「直接追加」対応）。時刻はデザイン未確定だったため、
// components/reminders/reminder-form.tsxの時刻入力（iOSは常時インラインspinner、Androidは
// ボタン+モーダル、スタイルも同一に揃える）をそのまま踏襲する。デフォルト18:00も
// reminder-form.tsxの新規リマインダーのデフォルトと揃え、アプリ内での「トレーニングの標準時刻」感を
// 一貫させる
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
    replaceReminderId,
    replaceHour,
    replaceMinute,
  } = useLocalSearchParams<{
    dateKey: string;
    // ルーティン版(schedule-routine-picker経由)はroutineId、直接追加版
    // (schedule-exercise-picker経由)はexerciseIdsのどちらか一方だけが渡る
    routineId?: string;
    routineName?: string;
    exerciseIds?: string;
    // 「今回だけ差し替え」（PR10-6b、schedule-routine-picker.tsx経由）のときだけ渡る。この3項目は
    // セットで存在する。直接追加には差し替え機能が無い
    replaceReminderId?: string;
    replaceHour?: string;
    replaceMinute?: string;
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
  // routineIdと同じ理由(不正な直リンク対策)で、replaceReminderIdもNumber.isInteger等で
  // 検証してから使う。素通しだとNaNのreminderIdでskipReminderOccurrence/DB書き込みを
  // 試みることになる(@reviewer指摘)。isPositiveIntegerは上のroutineIdガードとも共有する。
  // 「今回だけ差し替え」はルーティン版限定の機能のため、直接追加モードでは常にfalseにする
  const replaceReminderIdNum = replaceReminderId !== undefined ? Number(replaceReminderId) : undefined;
  const isReplaceMode = isRoutineMode && replaceReminderIdNum !== undefined && isPositiveInteger(replaceReminderIdNum);
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  const [permState, setPermState] = usePermissionState();
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);
  // 差し替え時は元のリマインダーの時刻をデフォルトにする(差し替えたいのは基本的に「中身」であって
  // 「時間帯」ではないため、毎回18:00から手動で直す手間を無くす、@designer方針)
  // replaceHour/replaceMinuteもreplaceReminderIdと同じ直リンク対策が必要(@reviewer追加指摘)。
  // 不正値(例:"abc")のまま素通しするとhour/minute stateがNaNになり、DateTimePickerに
  // Invalid Dateが渡ってしまうため、範囲外ならデフォルトの18:00にフォールバックする
  const [hour, setHour] = useState(() => {
    const h = replaceHour !== undefined ? Number(replaceHour) : NaN;
    return isReplaceMode && Number.isInteger(h) && h >= 0 && h <= 23 ? h : 18;
  });
  const [minute, setMinute] = useState(() => {
    const m = replaceMinute !== undefined ? Number(replaceMinute) : NaN;
    return isReplaceMode && Number.isInteger(m) && m >= 0 && m <= 59 ? m : 0;
  });
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
    // 差し替え合成(スキップ→手動予定追加)の前半が成立したかどうか。後半が失敗した場合の
    // 巻き戻し判定に使う(@reviewer Major指摘: 後半だけ失敗すると元の予定が無言で消えたまま残る)
    let skippedForReplace = false;
    try {
      try {
        setPermState(await ensurePermission());
      } catch (e) {
        console.error('[ensure permission]', e);
      }
      // 「今回だけ差し替え」（PR10-6b）: 元のリマインダー予定をこの日だけスキップしてから、
      // 選んだ新しいルーティンを手動予定として追加する。「差し替え = スキップ + 手動予定追加」という
      // 計画フェーズの合成方針の通り、既存のskipReminderOccurrence/createScheduledWorkoutを
      // そのまま2回呼ぶだけで実現する（専用の差し替えテーブルは持たない）。PR10-6cにより
      // ネイティブ方式リマインダーも一時キュー化で通知を止められるようになったため、
      // notificationSuppressedはトリガー方式ではなく通知API側の想定外エラーのみを示す。
      // 通常のスキップ(handleSkipReminder)と同じく、抑止できなかった場合は後で警告する
      // (@reviewer Major指摘: この経路だけ戻り値を握り潰していた)
      let notificationSuppressed = true;
      if (isReplaceMode && replaceReminderIdNum !== undefined) {
        const result = await skipReminderOccurrence(replaceReminderIdNum, dateKey);
        skippedForReplace = true;
        notificationSuppressed = result.notificationSuppressed;
      }
      if (isDirectMode) {
        await createDirectScheduledWorkout(exerciseIds, directTitle, dateKey, hour, minute);
      } else {
        await createScheduledWorkout(routineId, routineName ?? '', dateKey, hour, minute);
      }
      // 選択した時刻が既に過去(今日の過ぎた時刻を選んだ場合)は、
      // scheduled-workout-scheduler.tsのscheduleNotificationが通知登録を無言でスキップするため、
      // ここで一言伝えてからカレンダーへ戻る(@designerレビュー指摘: サイレントな機能欠落の防止)。
      // 判定式自体はscheduleNotification内部と同じものを使う必要があるため、
      // scheduled-workout-scheduler.tsから公開されたbuildScheduledWorkoutFireDateを再利用する
      const fireDate = buildScheduledWorkoutFireDate(dateKey, hour, minute);
      const isPastTime = fireDate.getTime() <= Date.now();
      // 「通知停止処理」という表現は不正確——ネイティブ方式の実体はcancelReminderOsNotifications
      // (個別に.catch(()=>{})で握りつぶすため実質失敗しない)ではなく、その後の一時キュー化で
      // 新しい通知を登録するscheduleQueueNotification側が失敗している可能性が高い(@reviewer指摘)
      const notificationSuppressionWarning =
        isReplaceMode && !notificationSuppressed
          ? '元の予定の新しい通知の登録処理に失敗した可能性があります。念のため指定時刻に通知が届いていないかご確認ください。'
          : null;
      // 通常のフロー（「予定を追加」→schedule-chooser→schedule-routine-picker/schedule-exercise-picker→
      // この画面）はカレンダーからの3階層分をまとめて閉じる必要がある(app/workout/routine-load.tsxの
      // router.dismiss(2)と同じ考え方だが、schedule-chooserが1枚増えた分+1)。一方「今回だけ差し替え」は
      // handlePressReplace(app/(tabs)/calendar.tsx)がschedule-chooserを経由せず
      // schedule-routine-pickerへ直接pushするため、カレンダーからは2階層分で済む
      const dismissCount = isReplaceMode ? 2 : 3;
      if (isPastTime || notificationSuppressionWarning) {
        const lines = [
          isReplaceMode
            ? isPastTime
              ? '通知は届きませんが、差し替えは完了しました。'
              : '差し替えが完了しました。'
            : '通知は届きませんが、予定はカレンダーに追加されました。',
        ];
        if (notificationSuppressionWarning) lines.push(notificationSuppressionWarning);
        // cancelable:falseが無いと、Android物理戻るボタンでこのAlertを無視できてしまう。isSubmitting系は
        // Alert表示前(finally節)で既に解除済みのため、その場合ボタンが再度押せる状態のまま画面に残り、
        // 同じ予定を重複作成できてしまう(自動レビュー指摘: Major)
        Alert.alert(
          isPastTime ? 'この時刻は過ぎています' : '差し替えました',
          lines.join('\n'),
          [{ text: 'OK', onPress: () => router.dismiss(dismissCount) }],
          { cancelable: false },
        );
      } else {
        router.dismiss(dismissCount);
      }
    } catch (e) {
      console.error('[add scheduled workout]', e);
      if (skippedForReplace && replaceReminderIdNum !== undefined) {
        // 前半(スキップ)は成立済みなので、後半(手動予定の追加)の失敗を「差し替えできませんでした」
        // で伝えるだけだと、実際には元の予定が消えたままの中途半端な状態が残ってしまう。
        // 巻き戻し自体が失敗した場合、2026-07-19のゴーストカードUI廃止以降はユーザー向けの
        // 手動復旧手段が無くなった（元のリマインダー予定は削除されたまま残る）。この二重失敗は
        // 極めて稀だがユーザーへの追加のエラーAlertは出さずログにのみ残す（変更前と同じ方針を維持）
        try {
          await unskipReminderOccurrence(replaceReminderIdNum, dateKey);
        } catch (rollbackError) {
          console.error('[rollback skip after replace failure]', rollbackError);
        }
      }
      Alert.alert('エラー', isReplaceMode ? '差し替えできませんでした。' : '予定を追加できませんでした。');
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
    router,
    setPermState,
    isReplaceMode,
    replaceReminderIdNum,
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
        <Stack.Screen options={{ title: '時刻を選択' }} />
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
          // タイトルをアクション名にし、日付・予定名はサブタイトル側にまとめる（デザイン指摘:
          // 隣接画面で主従が逆転していると視線移動が不自然になるため）
          headerTitle: () => (
            <HeaderTitle
              title="時刻を選択"
              subtitle={`${formatSessionDateGroup(parseDateKey(dateKey).getTime())}・${isDirectMode ? directTitle : routineName}`}
            />
          ),
        }}
      />
      <View style={styles.content}>
        {permState && permState !== 'granted' && (
          <PermissionBanner state={permState} onRequest={handleRequestPermission} />
        )}
        <FormField label="時刻">
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
        </FormField>
      </View>
      <View style={styles.footer}>
        <PrimaryButton
          label={isReplaceMode ? 'この時刻で差し替え' : 'この時刻で追加'}
          onPress={handleConfirm}
          disabled={isSubmitting}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: 16, gap: 16 },
  timeButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
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
