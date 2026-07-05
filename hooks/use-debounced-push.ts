import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';

// 遷移アニメーション中の連打で同じ画面が二重にpushされるのを防ぐ猶予時間
const NAVIGATION_DEBOUNCE_MS = 800;

// router.pushの二重発火防止。ref採用によりunmount後のタイマー発火も
// 単なるref代入で済むため、state更新に伴う警告・クラッシュのリスクがない。
export function useDebouncedPush() {
  const router = useRouter();
  const isNavigatingRef = useRef(false);

  const push = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      const reset = () => {
        isNavigatingRef.current = false;
      };
      try {
        router.push(href);
      } finally {
        setTimeout(reset, NAVIGATION_DEBOUNCE_MS);
      }
    },
    [router],
  );

  return push;
}
