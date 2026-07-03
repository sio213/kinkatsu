import { Colors } from '@/constants/theme';
import { StyleSheet } from 'react-native';

export const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  chipTextActive: { color: Colors.onAccent },
});
