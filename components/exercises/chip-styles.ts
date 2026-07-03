import { Colors } from '@/constants/theme';
import { StyleSheet } from 'react-native';

export const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.light.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipActive: { backgroundColor: Colors.light.accent, borderColor: Colors.light.accent },
  chipText: { fontSize: 13, color: Colors.light.textMuted, fontWeight: '500' },
  chipTextActive: { color: Colors.light.onAccent },
});
