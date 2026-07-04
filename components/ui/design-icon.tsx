import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Claude Designからダウンロードした Material Symbols のSVGパス（viewBox: 0 -960 960 960 共通）。
// IconSymbol（SF Symbols/MaterialIconsのクロスプラットフォーム抽象化）で十分な汎用ナビゲーション
// アイコン（戻る・⋮・検索等）はそちらを使い、DesignIconはデザインとのピクセル一致が必要な
// ⋮メニュー内アイコンなど限定的な用途にのみ使う。未使用のパスを増やさないよう使う分だけ追加する。
const PATHS = {
  edit: 'M160-120q-17 0-28.5-11.5T120-160v-97q0-16 6-30.5t17-25.5l505-504q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L313-143q-11 11-25.5 17t-30.5 6h-97Zm544-528 56-56-56-56-56 56 56 56Z',
  'delete-outline':
    'M280-120q-33 0-56.5-23.5T200-200v-520q-17 0-28.5-11.5T160-760q0-17 11.5-28.5T200-800h160q0-17 11.5-28.5T400-840h160q17 0 28.5 11.5T600-800h160q17 0 28.5 11.5T800-760q0 17-11.5 28.5T760-720v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM400-280q17 0 28.5-11.5T440-320v-280q0-17-11.5-28.5T400-640q-17 0-28.5 11.5T360-600v280q0 17 11.5 28.5T400-280Zm160 0q17 0 28.5-11.5T600-320v-280q0-17-11.5-28.5T560-640q-17 0-28.5 11.5T520-600v280q0 17 11.5 28.5T560-280ZM280-720v520-520Z',
} as const;

export type DesignIconName = keyof typeof PATHS;

export function DesignIcon({
  name,
  size = 24,
  color,
  style,
}: {
  name: DesignIconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" style={style}>
      <Path d={PATHS[name]} fill={color} />
    </Svg>
  );
}
