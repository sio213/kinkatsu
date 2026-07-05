import { Colors } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  message: string;
  actionLabel: string;
  onPressAction: () => void;
};

export function NotFoundState({ message, actionLabel, onPressAction }: Props) {
  return (
    <View style={styles.notFound}>
      <Text style={styles.notFoundText}>{message}</Text>
      <TouchableOpacity
        style={styles.notFoundBackBtn}
        onPress={onPressAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.notFoundBackBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  notFoundText: { fontSize: 15, color: Colors.textMuted },
  notFoundBackBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  notFoundBackBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },
});
