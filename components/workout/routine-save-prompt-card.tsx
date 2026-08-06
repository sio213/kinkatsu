import { DesignIcon } from '@/components/ui/design-icon';
import { ActionBanner } from '@/components/ui/action-banner';
import { Colors } from '@/constants/theme';

type Props = {
  onSave: () => void;
  onDismiss: () => void;
};

/**
 * 完了サマリーの種目一覧の下に出る「このメニューをルーティンとして保存」カード
 * （デザイン案「採用 ルーティンとして保存カード」）。
 *
 * 置き場所が種目一覧の下なのは、ここが「今日やった構成」を見終わった直後だから。
 * 数値やグラフの間に挟むと、成果を見る流れを断ち切ってセールスが割り込む形になる。
 *
 * 「今後表示しない」は文字どおり永続で、押すと二度と出ない（useRoutineSavePromptStore）。
 * 「今はしない」にすると「今回は見送る＝また今度出る」と読めるのに実際は永久に消えるため、
 * 効果より軽い文言を当てないこと。
 */
export function RoutineSavePromptCard({ onSave, onDismiss }: Props) {
  return (
    <ActionBanner
      tone="accent"
      icon={<DesignIcon name="repeat" size={20} color={Colors.accent} />}
      title="このメニューをルーティンとして保存"
      description="次回から1タップで同じメニューを開始できます"
      actions={[
        { label: '保存する', onPress: onSave },
        { label: '今後表示しない', onPress: onDismiss, variant: 'text' },
      ]}
    />
  );
}
