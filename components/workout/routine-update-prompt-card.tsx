import { ActionBanner } from '@/components/ui/action-banner';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors } from '@/constants/theme';

type Props = {
  routineName: string;
  // 差分の内訳（「追加した種目1件・値の変更2件」）。formatRoutineDiffSummaryが組み立てる
  summary: string;
  onConfirm: () => void;
  onDismiss: () => void;
};

/**
 * 完了サマリーの種目一覧の下に出る「『{ルーティン名}』の内容が変わっています」カード
 * （デザイン案③）。「ルーティンとして保存」カードと同じ`.pbn`＝ActionBannerで、
 * ルーティンから開始したセッションではこちらが排他で出る。
 *
 * タイトルに動詞を入れないのは、ボタン（「確認する」）が動詞を持っているのと、
 * 差分の向き（重量が上がった／下がった／種目をやらなかった）に左右されずに成立させるため。
 * 「今日の内容に更新」だと、調子が悪かった日に下方修正を勧める文言になる。
 *
 * 説明文を固定文にせず差分の件数にしているのは、差分ありの日が頻繁にあるため。
 * 毎回同じ文だと同じカードが居座って見えるが、件数なら内容が毎回変わる。
 *
 * ボタンは2つだけ。「今はしない」は置かない——カードはモーダルではないので、
 * 無視してスクロールで流すことが「今回は反映しない」の操作にあたる。
 */
export function RoutineUpdatePromptCard({ routineName, summary, onConfirm, onDismiss }: Props) {
  return (
    <ActionBanner
      tone="accent"
      icon={<DesignIcon name="repeat" size={20} color={Colors.accent} />}
      title={`「${routineName}」の内容が変わっています`}
      description={summary}
      actions={[
        { label: '確認する', onPress: onConfirm },
        { label: '今後表示しない', onPress: onDismiss, variant: 'text' },
      ]}
    />
  );
}
