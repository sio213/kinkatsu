import { Colors } from '@/constants/theme';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: string;
  required?: boolean;
  hideBadge?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function FormLabel({ children, required = false, hideBadge = false, containerStyle }: Props) {
  return (
    <View
      style={[styles.row, containerStyle]}
      accessible
      accessibilityLabel={hideBadge ? children : required ? `${children}、必須` : `${children}、任意`}
    >
      <View style={styles.bar} />
      <Text style={styles.label}>{children}</Text>
      {hideBadge ? null : required ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>必須</Text>
        </View>
      ) : (
        <Text style={styles.optionalText}>任意</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.accent },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textBody, letterSpacing: 0.2 },
  badge: {
    backgroundColor: Colors.dangerSurface,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.danger, letterSpacing: 0.3 },
  optionalText: { fontSize: 11, fontWeight: '500', color: Colors.textPlaceholder },
});
