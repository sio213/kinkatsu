import { isSameDay } from '@/lib/calendar/date-grid';
import { useMemo } from 'react';
import {
  useSessionExerciseCards,
  type RecordedExerciseCard,
  type UseSessionExerciseCardsResult,
} from './use-session-exercise-cards';
import { useWorkoutSessions } from './use-workout-session';

// 選択日パネルのカード。中身は完了サマリーの一覧と同じもので、取得と集計も共通
// （hooks/use-session-exercise-cards.ts）。この別名は既存の呼び出し側の語彙を保つためだけに残す
export type CalendarDayCard = RecordedExerciseCard;

export type UseCalendarDayExercisesResult = UseSessionExerciseCardsResult;

// 選択中の日付に開始した終了済みセッション（複数セッションがあれば全て）の種目カードを、
// 自己ベスト判定・前回比較つきでまとめて返す。この画面固有なのは「その日のセッションを選ぶ」
// ところだけで、取得・集計・再フォーカス時の再取得はuseSessionExerciseCardsが持つ
export function useCalendarDayExercises(selectedDate: Date): UseCalendarDayExercisesResult {
  const { sessions } = useWorkoutSessions();
  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.endedAt != null && isSameDay(new Date(s.startedAt), selectedDate))
        .map((s) => ({ id: s.id, startedAt: s.startedAt })),
    [sessions, selectedDate],
  );
  return useSessionExerciseCards(daySessions);
}
