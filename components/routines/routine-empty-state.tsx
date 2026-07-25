import { EmptyState } from '@/components/ui/empty-state';
import { useRoutineCreate } from '@/hooks/use-routine-create';

type Props = {
  /**
   * 「戻る」を押したときの遷移。フロー内のルーティン選択画面では渡す。記録タブのルーティン一覧は
   * タブ直下で戻る先が無いため省略し、「戻る」自体を出さない
   */
  onPressBack?: () => void;
};

// ルーティンが0件のときの空状態（デザイン案「トレーニング開始選択画面 デザイン案.html」06-b′）。
// ルーティン選択画面（components/routines/routine-picker-list.tsxを使う4画面）と記録タブの
// ルーティン一覧が同じ文言・同じアイコン・同じCTAを出すため、ユーザーに見える文字列を2箇所へ
// 複製せずここに1つだけ持つ（@reviewer指摘: 構造の複製より文言の複製のほうが静かに乖離しやすい）。
//
// 作成画面への遷移をここで閉じ込めることで、呼び出し元のRoutinePickerListは
// 「propで渡されたものだけを扱う」純粋な描画コンポーネントのままでいられる
// （components/workout/exercise-history-picker-view.tsxが参照しているprop注入方式の前例を崩さない）
export function RoutineEmptyState({ onPressBack }: Props) {
  const handleCreate = useRoutineCreate();

  return (
    <EmptyState
      icon="repeat"
      title="ルーティンがまだありません"
      description={'いつものメニューを登録すると、\n次回から選ぶだけで開始できます'}
      action={{ label: 'ルーティンを作成', icon: 'add', onPress: handleCreate }}
      onPressBack={onPressBack}
    />
  );
}
