import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { SessionHistoryPickerView, PAGE_SIZE } from '@/components/workout/session-history-picker-view';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { NO_SESSION_TO_EXCLUDE, type PastTrainingSession } from '@/lib/workout/history';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

export { PAGE_SIZE };

// トレーニング画面ヘッダー⋮「過去の記録から読み込む」から開く画面。一覧・ページング・
// カテゴリ絞り込みの実体はcomponents/workout/session-history-picker-view.tsx
// （app/routine/session-history-picker.tsxと共通）にあり、ここでは自分自身のセッションを
// 実績候補から除外する指定と、選択後の遷移先だけを担う。
// 2026-07-25以降はトレーニング開始選択画面(app/workout/start-chooser.tsx)の「過去の記録」からも
// 同じ画面へ来る。その場合はセッションがまだ存在しない（確定時に作る）ためnewSession=1が付き、
// 除外対象も無い。newSession/pastDateKeyは確定処理を担う次の画面
// (app/workout/session-history-load.tsx)まで引き継ぐ
export default function SessionHistoryPickerScreen() {
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

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/workout/session-history-load',
        params: {
          ...(isNewSession
            ? { newSession: '1', ...(pastDateKey ? { pastDateKey } : {}) }
            : { sessionId: String(sessionId) }),
          sourceSessionId: String(session.sessionId),
          // 画面3のヘッダーで日付を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          sourceStartedAt: String(session.startedAt),
        },
      });
    },
    [pushDebounced, sessionId, isNewSession, pastDateKey],
  );

  if (!isNewSession && !Number.isFinite(sessionId)) {
    return (
      <NotFoundScreen message="トレーニングが見つかりません" onPressBack={() => router.back()} />
    );
  }

  return (
    <SessionHistoryPickerView
      // newSession経路はまだセッションが無いので除外対象も無い。番兵値の意味は
      // app/routine/session-history-picker.tsx・app/calendar/schedule-workout-history-picker.tsxと同じ
      excludeSessionId={isNewSession ? NO_SESSION_TO_EXCLUDE : sessionId}
      onSelect={handleSelect}
    />
  );
}
