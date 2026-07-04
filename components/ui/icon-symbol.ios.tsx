import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  // SF Symbolsに縦向きの三点リーダーが無いため、横向きの ellipsis を回転させて代用する
  const rotateStyle: StyleProp<ViewStyle> = name === 'ellipsis' ? { transform: [{ rotate: '90deg' }] } : null;

  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        rotateStyle,
        style,
      ]}
    />
  );
}
