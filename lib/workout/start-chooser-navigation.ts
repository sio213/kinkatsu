/**
 * トレーニング開始選択画面(app/workout/start-chooser.tsx)発のフローで、内容を確定したときに
 * `router.dismiss()` へ渡す段数。
 *
 * この経路では確定するまで/workout/{id}をpushしていないため、単にpushするだけだとstart-chooserと
 * その子画面がスタックに残り、/workout/{id}側の「戻る」で呼び出し元（カレンダー/記録タブ）まで
 * 一気に戻れなくなる（@ユーザー指摘）。そこでstart-chooser以下をまとめて閉じてからpushする。
 *
 * スタックは常に「呼び出し元タブ(0) → start-chooser(+1) → …子画面」で固定できる。start-chooserは
 * app/(tabs)/(record)/index.tsx・app/(tabs)/calendar.tsxの2画面からしかpushされず、
 * これらのnewSession経路はstart-chooserからのみ到達するため。
 * 将来別の深さから開かれるようになった場合は静かに誤動作するので、ここを見直すこと。
 *
 * セッション生成(start-chooser-session.ts)とは別ファイルにしている。あちらはDB(@/db/client、
 * expo-sqlite)に依存するため、この純粋な値を参照するだけの画面テストまでDBのモックを強いられ、
 * 結果としてdismiss段数の検証がモックの値を見るだけの空回りになっていた（@reviewer指摘）
 */
export const START_CHOOSER_DISMISS_COUNT = {
  /** start-chooserの直下の子画面から確定する場合（種目追加ピッカー・ルーティン選択）: 自分自身+start-chooser */
  fromChild: 2,
  /** start-chooserから2段下で確定する場合（過去の記録一覧→読み込み）: 自分自身+一覧+start-chooser */
  fromGrandchild: 3,
} as const;
