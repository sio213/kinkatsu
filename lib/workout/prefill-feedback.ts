import type { PrefilledCard } from '@/lib/workout/session';

type Listener = (cards: PrefilledCard[]) => void;

let listeners: Listener[] = [];

// 種目追加ピッカー/入れ替え画面はDB操作の直後にrouter.back()で閉じてしまうため、
// 「前回の値をプリフィルした」ことを、戻り先のトレーニング中画面
// （app/workout/[id].tsx。ゴースト表示・「前回の値をクリア」導線に使う）に
// propsやparamsで直接渡す手段が無い。画面をまたいだ一度きりの通知を渡すだけなので、
// 状態管理ライブラリを増やさずこの薄いpub/subで済ませる
export function notifyPrefilled(cards: PrefilledCard[]) {
  if (cards.length === 0) return;
  listeners.forEach((listener) => listener(cards));
}

export function subscribePrefilled(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
