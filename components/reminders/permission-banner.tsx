import { ActionBanner } from '@/components/ui/action-banner';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { openSettings } from '@/lib/notifications/permissions';

type Props = {
  state: 'denied' | 'undetermined';
  onRequest: () => void;
};

// デザイン案(デザイン検討/ルーティン デザイン案.html「通知OFF時／端末通知が拒否の警告＋動線」)
// に準拠。warningアイコン+タイトル+本文+アクションボタンの構成。
// レイアウトはcomponents/ui/action-banner.tsxと共通（完了サマリーの「ルーティンとして保存」
// カードが同じ寸法を要求したため切り出したもの）
export function PermissionBanner({ state, onRequest }: Props) {
  const denied = state === 'denied';

  return (
    <ActionBanner
      tone="warning"
      icon={<IconSymbol name="exclamationmark.triangle.fill" size={20} color={Colors.warningAccent} />}
      title={denied ? '端末の通知がオフです' : '通知の許可が必要です'}
      description={denied ? 'このままでは通知が届きません' : undefined}
      actions={[
        {
          label: denied ? '設定を開く' : '許可する',
          onPress: denied ? openSettings : onRequest,
          icon: denied ? <IconSymbol name="arrow.up.right.square" size={16} color={Colors.onAccent} /> : undefined,
        },
      ]}
    />
  );
}
