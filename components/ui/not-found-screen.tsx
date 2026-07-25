import { NotFoundState } from '@/components/ui/not-found-state';
import { ScreenStyles } from '@/constants/theme';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  message: string;
  onPressBack: () => void;
  // ヘッダーのタイトル。ガード分岐は本来のヘッダー設定(Stack.Screen)を描画しないまま返るため、
  // app/_layout.tsx側でtitleを持たない画面ではここで指定しないとヘッダーが空になる。
  // 逆に_layout.tsxの静的titleで足りる画面では省略する（同じ文言を二重に持たない）
  title?: string;
};

// paramsが不正・対象がDBから消えている等で画面本体を描画できないときのガード用画面。
// 20以上の画面が
//   <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
//     <Stack.Screen options={{ title }} />
//     <NotFoundState message actionLabel="戻る" onPressAction={() => router.back()} />
//   </SafeAreaView>
// という完全に同じ形を持ち、そのためだけにStyleSheetを1エントリ抱えていたため共通化した。
//
// ボタンのラベルは「戻る」固定にしている。全24箇所の呼び出し元が「戻る」であり、
// 再取得できる状態（「再試行」）はガードではなく画面本体の一部として扱う方針のため
// （@reviewer指摘: 使う当てのないpropを先に生やさない。必要になったら
// actionLabelとonPressActionをNotFoundStateと同じ対で足すこと）。
//
// edgesを['bottom']で固定しているのは、ガードを持つ画面が現状すべて作成・編集フローや
// フロー内の中間画面としてルートStack上にあるため（CLAUDE.md「ナビゲーション・タブバーの
// 表示範囲」）。タブ配下の画面にガードを足す場合はタブバーが下端を占有するのでedgesの
// 外出しが必要になる。
//
// 「見つからない」以外の空状態（一覧が0件・取得失敗のリトライ等）は画面本体の一部なので、
// このコンポーネントではなくNotFoundStateを直接使う
export function NotFoundScreen({ message, onPressBack, title }: Props) {
  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      {title != null && <Stack.Screen options={{ title }} />}
      <NotFoundState message={message} actionLabel="戻る" onPressAction={onPressBack} />
    </SafeAreaView>
  );
}
