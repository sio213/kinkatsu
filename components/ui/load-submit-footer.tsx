import { DesignIcon } from '@/components/ui/design-icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { Colors } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled: boolean;
};

// 「一覧から複数選ぶ→まとめて確定する」画面（過去の記録から読み込む、ルーティンから読み込む等）で
// 共通するフッターの確定ボタン。CheckboxSelectHeader・use-checkbox-selection.tsとセットで使う想定
export function LoadSubmitFooter({ label, onPress, disabled }: Props) {
  return (
    <ScreenFooter>
      <PrimaryButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        icon={<DesignIcon name="download" size={16} color={Colors.onAccent} />}
      />
    </ScreenFooter>
  );
}
