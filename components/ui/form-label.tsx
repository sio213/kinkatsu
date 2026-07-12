import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SectionHeading } from './section-heading';

type Props = {
  children: string;
  required?: boolean;
  // 明示的に「任意」バッジを出したい項目にのみtrueを渡す。requiredもoptionalも
  // 指定しない場合はバッジなし（下部コメント参照）になる
  optional?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

// フォーム項目のラベル。必須/任意バッジは、実際に「空欄のまま送信できてしまう」項目
// （テキスト入力・デフォルト値のない複数選択など）にのみ付ける。デフォルト値があり常に
// 何らかの値が入っている項目（時刻・繰り返し種別・お気に入りトグル等の選択系コントロール）は
// 「空欄」という状態自体が存在しないため、requiredでもoptionalでもなくバッジなしにする
// （見出しだけ欲しい場合はFormLabelを使わずSectionHeadingを直接使う）
export function FormLabel({ children, required = false, optional = false, containerStyle }: Props) {
  const badge = required ? 'required' : optional ? 'optional' : 'none';

  return (
    <SectionHeading
      containerStyle={containerStyle}
      accessibilityLabel={
        badge === 'required' ? `${children}、必須` : badge === 'optional' ? `${children}、任意` : undefined
      }
      trailing={
        badge === 'required' ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>必須</Text>
          </View>
        ) : badge === 'optional' ? (
          <Text style={styles.optionalText}>任意</Text>
        ) : null
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
  badgeText: { ...Typography.badge, color: Colors.danger, letterSpacing: 0.3 },
  optionalText: { ...Typography.caption, color: Colors.textPlaceholder },
});
