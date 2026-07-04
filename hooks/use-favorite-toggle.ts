import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

// お気に入りの楽観的トグル（即時反映→失敗時ロールバック）。exercise-card / 種目詳細で共通化。
export function useFavoriteToggle(
  id: number | undefined,
  favorite: boolean | undefined,
  toggleFavorite: (id: number, favorite: boolean) => Promise<void>,
) {
  const [localFav, setLocalFav] = useState(!!favorite);

  useEffect(() => {
    setLocalFav(!!favorite);
  }, [favorite]);

  const toggle = useCallback(async () => {
    if (id == null) return;
    const next = !localFav;
    setLocalFav(next);
    try {
      await toggleFavorite(id, next);
    } catch (err) {
      console.error('[toggle favorite]', err);
      setLocalFav(!next);
      Alert.alert('エラー', 'お気に入りの更新に失敗しました。');
    }
  }, [id, localFav, toggleFavorite]);

  return { localFav, toggle };
}
