import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

type Props = {
  checked: boolean;
  size?: number;
  /**
   * 一部だけ選ばれている状態（チェックマークの代わりに横棒）。
   * 子のチェックボックスを持つ親にだけ使う——「全部入っている」と「一部だけ入っている」を
   * 同じ✓で表すと、開かないと違いが分からなくなるため。
   * 横棒はボックスの50%幅・高さ2.5・両端丸（デザイン仕様）
   */
  indeterminate?: boolean;
};

// チェックマークはボックスの62%の大きさ・線幅3・線端と角は丸（デザイン仕様）。
// MaterialIconsのcheckは線端が角ばっていて線も細く、同じ62%でも別物に見えるため自前で描く
const GLYPH_RATIO = 0.62;
const STROKE_WIDTH = 3;
const VIEW_BOX = 24;

// 見た目のみのプレゼンテーショナルコンポーネント。タップ処理は呼び出し側のTouchableOpacityが持つ
// （history-load-exercise-card.tsxの行チェックボックス、画面の「全選択」トグル、
// picker-exercise-row.tsxのチェックボックスモードで共有し、サイズ・角丸・チェックマークの見た目がズレないようにする）
export function Checkbox({ checked, size = 22, indeterminate = false }: Props) {
  const filled = checked || indeterminate;
  const glyph = Math.round(size * GLYPH_RATIO);

  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: Math.round(size * 0.27) },
        filled && styles.checked,
      ]}
    >
      {indeterminate ? (
        <View style={[styles.bar, { width: Math.round(size * 0.5) }]} />
      ) : (
        checked && (
          <Svg width={glyph} height={glyph} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
            <Polyline
              points="5,13 10,18 19,7"
              fill="none"
              stroke={Colors.onAccent}
              // 線幅は実寸で3pxになるようviewBoxの単位へ換算する
              strokeWidth={(STROKE_WIDTH * VIEW_BOX) / glyph}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  bar: { height: 2.5, borderRadius: 1.25, backgroundColor: Colors.onAccent },
});
