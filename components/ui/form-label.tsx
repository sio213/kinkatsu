import { Colors } from '@/constants/theme';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SectionHeading } from './section-heading';

type Props = {
  children: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

// フォーム項目のラベル。必須/任意バッジを必ず表示する（見出しだけ欲しい場合はSectionHeadingを使う）
export function FormLabel({ children, required = false, containerStyle }: Props) {
  return (
    <SectionHeading
      containerStyle={containerStyle}
      accessibilityLabel={required ? `${children}、必須` : `${children}、任意`}
      trailing={
        required ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>必須</Text>
          </View>
        ) : (
          <Text style={styles.optionalText}>任意</Text>
        )
      }
    >
      {children}
    </SectionHeading>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.dangerSurface,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.danger, letterSpacing: 0.3 },
  optionalText: { fontSize: 11, fontWeight: '500', color: Colors.textPlaceholder },
});
