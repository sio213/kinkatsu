import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

// headerTitleにそのまま渡せる、ナビゲーションタイトル＋補足サブタイトル(任意)。
// subtitleを渡さなければ1行表示になる（history-picker.tsx・exercise-swap.tsxで使用）
export function HeaderTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { ...Typography.navTitle, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
});
