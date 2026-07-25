import { HeaderBackButton } from '@/components/ui/header-back-button';
import { headerOptions } from '@/constants/theme';
import { Stack } from 'expo-router';

// グループ名と同名の子ルートが無いのでanchorを明示する。無いとディープリンク・コールドスタートで
// /exercises/[id] を直接開いたときに一覧が下に積まれず戻る導線が消える
// （app/(tabs)/(record)/_layout.tsx と同じ理由。実機で再現した実績あり）
export const unstable_settings = { anchor: 'exercises/index' };

/**
 * 種目タブ配下のStack。種目一覧（/exercises）と種目詳細（/exercises/[id]）を持つ。
 * どちらも「閲覧・ドリルダウン」なのでタブバーを出したままにする
 * （CLAUDE.md「ナビゲーション・タブバーの表示範囲」）。
 *
 * 種目詳細の実体と、2つのURLがある理由は components/exercises/exercise-detail-screen.tsx を参照。
 *
 * グループ名`(library)`はヘッダー「種目ライブラリ」に由来（タブラベルは「種目」）。グループに
 * しているのはURLを変えないためで、実ディレクトリにすると /exercises が /library/exercises に
 * なる。また一覧を(library)/index.tsxに置くとURLが`/`となり記録タブ((record)/index.tsx)と
 * 衝突するので、exercises/という実セグメントを残している。
 */
export default function LibraryStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerLeft: ({ tintColor }) => <HeaderBackButton tintColor={tintColor} />,
      }}
    >
      <Stack.Screen name="exercises/index" options={{ title: '種目ライブラリ' }} />
      {/* タイトルは種目名を動的に出すため画面側でStack.Screen optionsを上書きする */}
      <Stack.Screen name="exercises/[id]" options={{ title: '' }} />
    </Stack>
  );
}
