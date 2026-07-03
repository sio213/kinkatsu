import { Colors } from '@/constants/theme';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function FormLabel({ children, required = false, containerStyle }: Props) {
  return (
    <View
      style={[styles.row, containerStyle]}
      accessible
      accessibilityLabel={required ? `${children}、必須` : children}
    >
      <Text style={styles.label}>{children}</Text>
      {required ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>必須</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  badge: {
    backgroundColor: Colors.dangerSurface,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.danger, letterSpacing: 0.3 },
});
