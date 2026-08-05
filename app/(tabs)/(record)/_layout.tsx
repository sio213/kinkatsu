import { HeaderBackButton } from '@/components/ui/header-back-button';
import { headerOptions } from '@/constants/theme';
import { Stack } from 'expo-router';

// expo-routerは「グループ名と同名の子ルート」が無い場合、暗黙のanchorを設定しない。
// anchorはlinking config(ディープリンク・コールドスタート時のstate復元)にのみ使われるため、
// 未指定だと`kinkatsu:///routine`で直接起動したときにindexが下に積まれず戻る導線が消える
// （HeaderBackButtonがcanGoBack()=falseで非表示になり行き止まりになる。実機で再現・修正確認済み）
export const unstable_settings = { anchor: 'index' };

/**
 * 記録タブ配下のStack。
 *
 * CLAUDE.md「ナビゲーション・タブバーの表示範囲」の原則どおり、閲覧・ドリルダウンの画面は
 * タブバーを出したままにするためタブ配下のStackへ置く。ルーティン一覧はまさにこれに当たる
 * （移設前は app/routine/index.tsx としてルートStackにあり、開くとタブバーが消えて行き止まりに見えていた）。
 * ルーティンの作成・編集・種目選択（/routine/new, /routine/edit/[id] 等）は「編集フロー」なので
 * ルートStackに残してあり、そちらへpushするとタブバーは消える。
 *
 * 実ディレクトリ`record/`ではなくグループ`(record)`にしているのは、URLを変えないため
 * （実ディレクトリにすると`/routine`が`/record/routine`になりディープリンク・typed routesが壊れる）。
 * このStackがヘッダーを持つため、(tabs)/_layout.tsx 側では (record) の headerShown を false に
 * している（両方が有効だとタブナビゲータのヘッダーとこのStackのヘッダーが二重に出る）。
 */
export default function RecordStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        // ルートStack(app/_layout.tsx)と同じく一括指定にしておく。ここに画面を足したときの
        // 指定漏れで、素のネイティブ戻るボタン(左端に寄りすぎる)が黙って出るのを防ぐ
        headerLeft: ({ tintColor }) => <HeaderBackButton tintColor={tintColor} />,
      }}
    >
      {/* タブのルートには戻るシェブロンを出さない。HeaderBackButtonのcanGoBack()は
          タブナビゲータまで遡って判定するため、別のタブから切り替えてくるとtrueになり、
          Stack先頭のこの画面にもシェブロンが出てしまう（押すと直前のタブへ戻る＝
          タブをスタックのように扱う挙動になり、iOSの作法から外れる。@ユーザー指摘）。
          native-stackの標準の戻るボタンはStack先頭では出ないため、headerLeftを空にするだけでよい
          （完了サマリーのようにpushされた画面ではheaderBackVisibleも要る） */}
      <Stack.Screen name="index" options={{ title: '記録', headerLeft: () => null }} />
      <Stack.Screen name="routine" options={{ title: 'ルーティン' }} />
    </Stack>
  );
}
