import { useScrollAfterKeyboardShow } from '@/hooks/use-scroll-after-keyboard-show';
import { createContext, useCallback, useContext, type ReactNode, type RefObject } from 'react';
import type { HostInstance, ScrollView, View } from 'react-native';

// フォーカスした入力欄の下に残す余白。キーボード（＋その上の固定フッター）にぴったり接した
// 位置に出すと、打っている行が画面の縁に貼り付いて窮屈に見えるため少し浮かせる
const BOTTOM_MARGIN = 24;

// getInnerViewRef()は実装(react-native/Libraries/Components/ScrollView/ScrollView.js)には
// あるがReact Nativeの型定義に含まれていない。measureLayoutが受け付けるノードハンドル(number)を
// 返すgetInnerViewNode()は非推奨扱いのため、New Architecture(Fabric)でも安定するHostInstance版を
// 型を補って使う（components/ui/form-scroll-context.tsxと同じ理由）
type ScrollViewInternals = ScrollView & { getInnerViewRef(): View | null };

// ScrollView・FlatListのどちらもgetScrollResponder()で実スクロールビューを得られる
// （ScrollViewは自分自身を、FlatListは内部のScrollViewを返す）。FlatListは要素の型を持つため、
// 画面ごとのrefをそのまま渡せるよう構造的な型で受ける
type ScrollTarget = { getScrollResponder?: () => unknown };

// measureLayout/measureを持つもの（TextInput・View）だけを受け取る
type Measurable = Pick<HostInstance, 'measureLayout' | 'measure'>;

type ScrollFocusedInputIntoView = (node: Measurable | null) => void;

const FocusedInputScrollContext = createContext<ScrollFocusedInputIntoView | null>(null);

type Metrics = {
  // 表示領域（スクロールビュー自身）の上端から見た入力欄のY座標と、入力欄の高さ
  viewportY: number;
  inputHeight: number;
  // コンテンツ（スクロールされる中身）の上端から見た入力欄のY座標
  contentY: number;
  // 表示領域の高さ。キーボードが開いている間はKeyboardAvoidingScreenによって縮んでいる
  viewportHeight: number;
};

// スクロール先の絶対オフセットを求める。既に見えている（＝下にはみ出していない）ならnullを返し、
// 呼び出し側はスクロールしない。タップしただけで画面が動くのは煩わしいため、隠れている
// ときだけ動かす。
// scrollTo()は絶対オフセットを取るため、現在のスクロール位置を
// 「コンテンツ基準のY − 表示領域基準のY」から逆算して足す
export function computeFocusedInputScrollTarget({
  viewportY,
  inputHeight,
  contentY,
  viewportHeight,
}: Metrics): number | null {
  const bottomOverflow = viewportY + inputHeight + BOTTOM_MARGIN - viewportHeight;
  if (bottomOverflow <= 0) return null;
  const currentOffset = contentY - viewportY;
  return Math.max(0, currentOffset + bottomOverflow);
}

function measureLayoutIn(node: Measurable, relativeTo: HostInstance) {
  return new Promise<{ y: number; height: number } | null>((resolve) => {
    node.measureLayout(
      relativeTo,
      (_x, y, _width, height) => resolve({ y, height }),
      () => resolve(null),
    );
  });
}

function measureHeight(node: Measurable) {
  return new Promise<number | null>((resolve) => {
    node.measure((_x, _y, _width, height) => resolve(height ?? null));
  });
}

type ProviderProps<T extends ScrollTarget> = {
  scrollRef: RefObject<T | null>;
  children: ReactNode;
};

// 入力欄にフォーカスしたとき、キーボードと下部固定フッターに隠れる位置ならスクロールして
// 見える位置へ出すための橋渡し。入力欄(components/ui/boxed-text-input.tsx)とスクロールビューの
// 参照(各画面が持つ)は別の場所にあるため、FormScrollProviderと同じくContextで仲介する。
//
// iOSにはフォーカスした入力欄をキーボードの上へ出すUIKit自身の自動スクロールがあるが、
// `KeyboardAvoidingScreen`でスクロールビュー自体がキーボードの上に収まる構成では、
// UIKitから見て「入力欄はキーボードに隠れていない」ため何もしてくれない。実際には
// 表示領域が縮んだ分だけ入力欄がフッターの裏へはみ出すので、こちらで出し直す必要がある。
//
// 画面側でやることは、スクロールビューをこのProviderで包んでrefを渡すだけ
// （レイアウトには一切手を入れないので、既存の余白・スクロール挙動は変わらない）。
// Provider外のBoxedTextInputは何も起きない。
export function FocusedInputScrollProvider<T extends ScrollTarget>({ scrollRef, children }: ProviderProps<T>) {
  const scrollAfterKeyboardShow = useScrollAfterKeyboardShow();

  const scrollIntoView = useCallback<ScrollFocusedInputIntoView>(
    (node) => {
      if (node == null) return;
      // キーボードが出切って（＝KeyboardAvoidingScreenが表示領域を縮め終えて）から測る。
      // それより前に測ると縮む前の高さで「隠れていない」と誤判定する
      scrollAfterKeyboardShow(() => {
        const scrollView = scrollRef.current?.getScrollResponder?.() as ScrollViewInternals | undefined;
        const viewport = scrollView?.getNativeScrollRef();
        const content = scrollView?.getInnerViewRef();
        if (scrollView == null || viewport == null || content == null) return;

        Promise.all([
          measureLayoutIn(node, viewport),
          measureLayoutIn(node, content),
          measureHeight(viewport),
        ]).then(([inViewport, inContent, viewportHeight]) => {
          if (inViewport == null || inContent == null || viewportHeight == null) return;
          const target = computeFocusedInputScrollTarget({
            viewportY: inViewport.y,
            inputHeight: inViewport.height,
            contentY: inContent.y,
            viewportHeight,
          });
          if (target == null) return;
          scrollView.scrollTo({ y: target, animated: true });
        });
      });
    },
    [scrollAfterKeyboardShow, scrollRef],
  );

  return <FocusedInputScrollContext.Provider value={scrollIntoView}>{children}</FocusedInputScrollContext.Provider>;
}

const NOOP: ScrollFocusedInputIntoView = () => {};

// 入力欄のonFocusから呼ぶ。Provider外（＝スクロールしない画面）ではno-opになる
export function useScrollFocusedInputIntoView(): ScrollFocusedInputIntoView {
  return useContext(FocusedInputScrollContext) ?? NOOP;
}
