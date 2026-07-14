import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  onPress: () => void;
};

// 記録タブの「進行中のトレーニングを再開する」バナー。単体で切り出しているのは
// このバナーの見た目・文言をロジック(handleStart等)から独立して読めるようにするため
export function ResumeWorkoutBanner({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.resumeBanner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="進行中のトレーニングを再開する"
    >
      <IconSymbol name="timer" size={18} color={Colors.accent} />
      <Text style={styles.resumeBannerText}>進行中のトレーニングを再開する</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    padding: 12,
  },
  resumeBannerText: { color: Colors.accent, ...Typography.bodyStrong },
});
