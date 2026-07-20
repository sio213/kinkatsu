import { useEffect, useState } from 'react';

// 1秒ごとに更新される現在時刻。経過時間のライブ表示（トレーニング中画面のタイマー・
// 再開バナー等）に使う。isActiveがfalseの間はintervalを張らない
export function useTickingNow(isActive: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);
  return now;
}
