import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function AddExerciseButton({ onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="種目を追加"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <IconSymbol name="plus" size={18} color={Colors.accent} />
      <Text style={styles.text}>種目を追加</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  text: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
});
