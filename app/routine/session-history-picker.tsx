import { SessionHistoryPickerView } from '@/components/workout/session-history-picker-view';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { NO_SESSION_TO_EXCLUDE, type PastTrainingSession } from '@/lib/workout/history';
import { useCallback } from 'react';

// ルーティンの種目編集画面ヘッダー⋮「過去の記録から読み込む」から開く画面。app/workout/session-history-picker.tsxの
// ルーティン版で、一覧・ページング・カテゴリ絞り込みの実体はcomponents/workout/session-history-picker-view.tsx
// （workout版と共通）にある。ルーティンには「進行中セッション」の概念が無いため、除外対象は無い
// ことを表す番兵値(NO_SESSION_TO_EXCLUDE)を渡し、全ての終了済みセッションを対象にする
export default function RoutineSessionHistoryPickerScreen() {
  const pushDebounced = useDebouncedPush();

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/routine/session-history-load',
        params: {
          sourceSessionId: String(session.sessionId),
          // 画面2のヘッダーで日付を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          sourceStartedAt: String(session.startedAt),
        },
      });
    },
    [pushDebounced],
  );

  return <SessionHistoryPickerView excludeSessionId={NO_SESSION_TO_EXCLUDE} onSelect={handleSelect} />;
}
