import { getPermissionState, type PermissionState } from '@/lib/notifications/permissions';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// 通知の許可状態をマウント時に取得し、OS設定アプリで許可状態を変更してこのアプリに
// 戻ってきた際(バックグラウンド→フォアグラウンド遷移)にも再取得して反映する。
// マウント時の一度きりの取得だけだと、アプリを再起動するまで許可状態の変更が
// 画面(警告バナーの表示/非表示など)に反映されなかったため。
// 戻り値の2つ目はensurePermission()等でアプリ内から許可状態が変わった際に
// 即時反映するための手動更新用setter
export function usePermissionState(): [PermissionState | null, (state: PermissionState) => void] {
  const [permState, setPermState] = useState<PermissionState | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    getPermissionState().then(setPermState);

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current !== 'active' && next === 'active') {
        getPermissionState().then(setPermState);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  return [permState, setPermState];
}
