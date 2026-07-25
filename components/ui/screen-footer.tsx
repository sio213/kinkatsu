import { Colors } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  children: ReactNode;
};

// 保存・決定・追加などの確定ボタンを載せる下部固定の帯。
//
// 以前は各画面が同じstyleを個別に定義しており、しかも値が2系統に割れていた
// （左右20/下12 が11画面、左右16/下16 が12画面）。同じ「下部固定フッター」なのに画面を
// 行き来すると確定ボタンの幅と高さが変わる状態で、特にルーティン編集→種目追加ピッカー→
// テンプレートセット編集は1つのフロー内で 20→16→20 と動いていた。
//
// 左右16・下16へ統一している（@designer判断）。根拠:
// - 16系は2定義ともスクロール本体のpaddingと一致していたが、20系は8定義中2つ
//   (app/workout/[id].tsx・app/calendar/schedule-time-picker.tsx)が本体16に対しフッター20で、
//   既に画面内で食い違っていた。16へ寄せるとこの2画面のズレも直る
// - 画面上部のchrome帯(components/ui/context-bar.tsx)も左右16で、その上下対として揃う
// - 種目追加ピッカー等のリストは行が画面端から一直線に並ぶため、フッターだけ内側にズレると
//   気づかれやすい。フォーム画面は枠付き入力が並び「揃うべき垂直線」が弱いので変化が目立ちにくい
//
// 下は12ではなく16。SafeAreaView edges={['bottom']}の内側なのでホームインジケータのある端末では
// safe-area insetが乗って差は小さいが、Androidの3ボタンナビ等insetが小さい端末では生値がそのまま
// 効くため、誤操作マージンとして厚い方を採る
export function ScreenFooter({ children }: Props) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
