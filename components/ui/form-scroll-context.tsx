import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Keyboard, type ScrollView, View } from 'react-native';

// エラー項目の直上に少し余白を残す(画面の一番上ぎりぎりに張り付くと窮屈に見えるため)
const SCROLL_TOP_MARGIN = 16;

// ScrollView.getInnerViewRef()は実装(react-native/Libraries/Components/ScrollView/ScrollView.js)
// には存在するが、この時点のReact Nativeの型定義には含まれていない(型定義にあるのは
// ノードハンドル(number)を返すgetInnerViewNode()のみ)。measureLayoutはノードハンドルも
// 受け付けるが非推奨扱いのため、New Architecture(Fabric)でも安定するHostInstance版を
// 型を補ってでも使う
type ScrollViewWithInnerViewRef = ScrollView & { getInnerViewRef(): View | null };

// 実測したY座標群から「一番上にある項目」を選ぶ純粋関数。react-hook-formのerrorsの
// キー順は登録順であり画面上の表示順と必ずしも一致しない(リマインダーフォームのようにkindで
// フィールドの出し分けが変わるフォームは特に)ため、キー順ではなく実測値の最小値で判定する。
// 測定できなかった項目(非表示・アンマウント済み等)はnullとして渡ってくる想定
export function pickTopmostY(measuredYs: (number | null)[]): number | null {
  const valid = measuredYs.filter((y): y is number => y != null);
  return valid.length > 0 ? Math.min(...valid) : null;
}

export function computeScrollTarget(topmostY: number, margin: number = SCROLL_TOP_MARGIN): number {
  return Math.max(0, topmostY - margin);
}

type FieldRegistry = Map<string, RefObject<View | null>>;

type FormScrollContextValue = {
  register: (name: string, ref: RefObject<View | null>) => void;
  unregister: (name: string) => void;
  scrollToError: (names: string[]) => void;
};

const FormScrollContext = createContext<FormScrollContextValue | null>(null);

type ProviderProps = {
  scrollRef: RefObject<ScrollView | null>;
  children: ReactNode;
};

// バリデーションエラー時に「エラーになった項目のうち画面上で一番上にあるもの」が見える位置まで
// 自動スクロールするための橋渡し。ScrollViewの参照(各画面シェルが持つ)とエラー情報
// (各フォームのuseFormが持つformState.errors)は別の場所にあるため、Contextで仲介する。
// FormFieldがname付きで使われるたびに自身のrefをここへ登録し、フォーム側は送信失敗時に
// useScrollToFirstError()で得た関数へエラーのフィールド名一覧(Object.keys(errors))を
// 渡すだけでよい。新しいフォームを追加する際は、①このProviderでScrollViewを包む
// ②各FormFieldにname(useFormのfield名と同じもの)を渡す③submitをhandleSubmit(onValid, onInvalid)
// にする、の3点を満たせば自動的にこの機能が有効になる(CLAUDE.mdのフォーム実装ルール参照)
export function FormScrollProvider({ scrollRef, children }: ProviderProps) {
  const fieldsRef = useRef<FieldRegistry>(new Map());

  const register = useCallback((name: string, ref: RefObject<View | null>) => {
    fieldsRef.current.set(name, ref);
  }, []);

  const unregister = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const scrollToError = useCallback(
    (names: string[]) => {
      const scrollView = scrollRef.current;
      // getInnerViewRef()はScrollViewの「中身(コンテンツ)」を基準にした座標を得るために使う。
      // ScrollView自身を基準にすると現在のスクロール位置に依存した値になってしまい、
      // scrollTo({y})が期待する絶対オフセットと噛み合わなくなる
      const containerRef = (scrollView as ScrollViewWithInnerViewRef | null)?.getInnerViewRef();
      if (containerRef == null) return;

      // フォーカスが残ったTextInputとスクロールが競合しないよう、先にキーボードを閉じる。
      // dismiss直後はまだレイアウトが安定していないことがあるため1フレーム待ってから測定する
      Keyboard.dismiss();
      requestAnimationFrame(() => {
        const refs = names
          .map((name) => fieldsRef.current.get(name))
          .filter((ref): ref is RefObject<View | null> => ref?.current != null);
        if (refs.length === 0) return;

        Promise.all(
          refs.map(
            (ref) =>
              new Promise<number | null>((resolve) => {
                ref.current?.measureLayout(
                  containerRef,
                  (_x: number, y: number) => resolve(y),
                  () => resolve(null),
                );
              }),
          ),
        ).then((ys) => {
          const topmostY = pickTopmostY(ys);
          if (topmostY == null) return;
          scrollView?.scrollTo({ y: computeScrollTarget(topmostY), animated: true });
        });
      });
    },
    [scrollRef],
  );

  const value = useMemo(() => ({ register, unregister, scrollToError }), [register, unregister, scrollToError]);

  return <FormScrollContext.Provider value={value}>{children}</FormScrollContext.Provider>;
}

// FormField内部から呼ぶ。nameが無い(Provider外で使われている等)場合は何もしない
export function useFormScrollRegistration(name: string | undefined, ref: RefObject<View | null>) {
  const ctx = useContext(FormScrollContext);
  useEffect(() => {
    if (!name || !ctx) return;
    ctx.register(name, ref);
    return () => ctx.unregister(name);
    // refは同一インスタンスを使い回す前提(FormField側でuseRefして渡す)ため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ctx]);
}

// 各フォームのsubmit失敗時(handleSubmitの第2引数)に呼ぶ。Provider外ならno-opにする
export function useScrollToFirstError() {
  const ctx = useContext(FormScrollContext);
  return useCallback(
    (errors: Record<string, unknown>) => {
      ctx?.scrollToError(Object.keys(errors));
    },
    [ctx],
  );
}
