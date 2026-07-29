import { useCallback, useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';

// 「TextInputへフォーカスした直後のスクロール」を、キーボードが出切ってレイアウトが確定してから
// 実行するためのフック。
//
// 種目追加直後の頭出し（追加されたカードへスクロール＋最初のセット入力欄へフォーカス）は、
// focus()と同じフレームでスクロールしても最終的な表示位置が2つの要因に上書きされてしまう。
//   1. iOSはTextInputがフォーカスされるとUIKit自身がスクロールビューを動かす（入力欄が
//      キーボードに隠れない位置まで）。こちらのscrollToはこれに打ち消される
//   2. その直後に`KeyboardAvoidingScreen`がキーボード分のpaddingを入れてスクロールビュー自体の
//      高さを縮めるため、1.で「キーボードの上」に来ていたはずの位置が今度は縮んだ表示領域の
//      下（＝固定フッターの裏）へはみ出す
// どちらもkeyboardWillShowの時点で起きる。keyboardDidShow（＝縮小後のレイアウトが確定した後）
// まで遅らせることで、最後にこちらの位置決めが効くようにする。
//
// 既にキーボードが出ている状態から呼ばれた場合はkeyboardDidShowが来ないため、タイマーでも
// 発火させる（Androidはウィンドウ自体がリサイズされ`KeyboardAvoidingScreen`が何もしないが、
// 1.の自動スクロールは同様に起きるため、プラットフォームでの出し分けはしない）。
const FALLBACK_DELAY_MS = 400;

export function useScrollAfterKeyboardShow() {
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  return useCallback((scroll: () => void) => {
    // 予約が残っている間に次の追加が来た場合は、常に新しい方の位置を採る
    cancelRef.current?.();
    const run = () => {
      cancelRef.current?.();
      scroll();
    };
    // 既にキーボードが出ている（＝入力欄から別の入力欄へフォーカスを移した）場合は
    // keyboardDidShowが来ないうえ、レイアウトも縮み終わっているので待つ必要がない。
    // ただしUIKitの自動スクロールより後に効かせたいので1フレームだけ遅らせる
    if (Keyboard.isVisible()) {
      const frame = requestAnimationFrame(run);
      cancelRef.current = () => {
        cancelAnimationFrame(frame);
        cancelRef.current = null;
      };
      return;
    }
    const subscription = Keyboard.addListener('keyboardDidShow', run);
    const timer = setTimeout(run, FALLBACK_DELAY_MS);
    cancelRef.current = () => {
      subscription.remove();
      clearTimeout(timer);
      cancelRef.current = null;
    };
  }, []);
}
