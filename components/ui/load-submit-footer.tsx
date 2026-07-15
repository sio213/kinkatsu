import { DesignIcon } from '@/components/ui/design-icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled: boolean;
};

// 「一覧から複数選ぶ→まとめて確定する」画面（過去の記録から読み込む、ルーティンから読み込む等）で
// 共通するフッターの確定ボタン。CheckboxSelectHeader・use-checkbox-selection.tsとセットで使う想定
export function LoadSubmitFooter({ label, onPress, disabled }: Props) {
  return (
    <View style={styles.footer}>
      <PrimaryButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        icon={<DesignIcon name="download" size={16} color={Colors.onAccent} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
