import { dateKeyToNoonMs, isValidDateKey } from '@/lib/calendar/date-grid';
import { createPastWorkoutSession, startWorkoutSession } from '@/lib/workout/session';

/**
 * トレーニング開始選択画面(app/workout/start-chooser.tsx)発のフローで、ユーザーが実際に内容を
 * 確定した時点でセッションを作る。
 *
 * 2026-07-25、@ユーザー指摘: 以前は選択画面でカードをタップした瞬間に空セッションを作っていたため、
 * 種目追加ピッカーや過去の記録一覧で「戻る」を押すと空の記録がDBに残ってしまっていた。
 * そのためセッション作成を子画面の確定操作(app/workout/exercise-picker.tsxのonConfirm・
 * app/workout/session-history-load.tsxのonSubmit)まで遅らせ、戻った場合は何も作らないようにした。
 *
 * pastDateKeyが妥当な日付キーならカレンダー過去日パネル「記録を追加」経由の事後記録として
 * startedAt=endedAt=その日の正午の完了済みセッションを、そうでなければ今日のライブセッションを作る。
 *
 * @returns 作成したセッションのid
 */
export async function createStartChooserSession(pastDateKey?: string): Promise<number> {
  if (isValidDateKey(pastDateKey)) {
    return (await createPastWorkoutSession(dateKeyToNoonMs(pastDateKey))).id;
  }
  return (await startWorkoutSession()).id;
}
