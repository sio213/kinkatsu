import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

// 「進行中のトレーニングを再開する」バナー。記録タブ・ルーティン一覧で見た目・文言を揃えるため共通化
export function ResumeWorkoutBanner({ onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.resumeBanner, style]}
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
