import { HeaderAddButton } from '@/components/ui/header-add-button';
import { useRoutineCreate } from '@/hooks/use-routine-create';

// ルーティン選択画面（components/routines/routine-picker-list.tsxを使う4画面）と記録タブの
// ルーティン一覧のヘッダー右に置く「ルーティンを作成」ボタン。選びたいルーティンがまだ無いとき、
// フローを抜けて記録タブのルーティン一覧まで戻らなくてもその場で作れるようにする。1アクション
// だけのため⋮メニューではなく、種目一覧・ルーティン一覧・リマインダー一覧と同じ
// HeaderAddButton（＋）に揃える。
//
// 0件のときは空状態(EmptyState)も同じ遷移の主CTA「ルーティンを作成」を出すため、同じラベルの
// ボタンが1画面に2つ並ぶ。＋を隠す案もあったが、一覧の有無でヘッダーの構成が変わらないほうが
// 分かりやすいとの判断でそのまま出す（@ユーザー指摘）。遷移処理はuseRoutineCreateで共通化してある
export function RoutineCreateHeaderButton() {
  const handlePress = useRoutineCreate();

  return <HeaderAddButton onPress={handlePress} accessibilityLabel="ルーティンを作成" />;
}
