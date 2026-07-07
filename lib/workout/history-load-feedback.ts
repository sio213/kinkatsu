import type { SetSnapshot } from '@/lib/workout/session';

export type HistoryLoadEvent = {
  sessionId: number;
  sessionExerciseId: number;
  // トースト表示用の短い日付（例:「7/3」）
  dateLabel: string;
  // 「取り消す」タップ時にundoLoadHistoryへそのまま渡す、読み込み直前のスナップショット
  previousSnapshot: SetSnapshot[];
};

type Listener = (event: HistoryLoadEvent) => void;

let listeners: Listener[] = [];

// 記録から読み込む画面はDB操作の直後にrouter.back()で閉じてしまうため、「読み込んだ」ことと
// 取り消しに必要なスナップショットを、戻り先のトレーニング中画面（app/workout/[id].tsx）に
// propsやparamsで直接渡す手段が無い。lib/workout/prefill-feedback.tsと同じ理由の
// 画面をまたいだ一度きりの通知
export function notifyHistoryLoaded(event: HistoryLoadEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeHistoryLoaded(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
