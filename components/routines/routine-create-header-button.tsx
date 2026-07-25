import { HeaderAddButton } from '@/components/ui/header-add-button';
import type { Routine } from '@/db/schema';
import { useRoutineCreate } from '@/hooks/use-routine-create';

// ルーティン選択画面（components/routines/routine-picker-list.tsxを使う4画面）のヘッダー右に
// 置く「ルーティンを作成」ボタン。選びたいルーティンがまだ無いとき、フローを抜けて記録タブの
// ルーティン一覧まで戻らなくてもその場で作れるようにする。1アクションだけのため⋮メニューでは
// なく、種目一覧・ルーティン一覧・リマインダー一覧と同じHeaderAddButton（＋）に揃える。
//
// 遷移処理はuseRoutineCreateに共通化してあり、0件時の空状態(EmptyState)の主CTAと同じ画面へ進む
export function RoutineCreateHeaderButton() {
  const handlePress = useRoutineCreate();

  return <HeaderAddButton onPress={handlePress} accessibilityLabel="ルーティンを作成" />;
}

/**
 * 上記ボタンを`Stack.Screen`の`headerRight`へ渡すためのヘルパー。0件のときは空状態(EmptyState)が
 * 同じ「ルーティンを作成」を主CTAとして大きく出すため、ヘッダーの＋は出さない。
 *
 * 出したままだと、同じラベル・同じ遷移のボタンが1画面に2つ並び、VoiceOverでは区別が付かない
 * （@tester指摘。実際に0件時に`accessibilityLabel="ルーティンを作成"`のボタンが2件描画されていた）。
 * デザイン案「トレーニング開始選択画面 デザイン案.html」06-b′のヘッダーも右側は空のままなので、
 * 見た目の面でもこちらが正。
 *
 * 4画面すべてが同じ判断をするため、条件を各画面にコピーせずここに置く。ヘッダー設定は画面側の
 * `Stack.Screen`が持つ責務なので、コンポーネント内部でDBを引いて自分を隠す作りにはしていない。
 */
export function routineCreateHeaderRight(routines: Routine[]) {
  if (routines.length === 0) return undefined;
  return () => <RoutineCreateHeaderButton />;
}
