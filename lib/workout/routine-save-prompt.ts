type Input = {
  // ⋮の「ルーティンとして保存」を出せる状態か（フリー開始 かつ 積む種目がある）。
  // routineId/カード数から再計算せず⋮と同じ値を受け取ることで、「本文カードが出るなら
  // ⋮にも必ず項目がある」という包含関係を構造として保証する。条件を別々に書くと、
  // 片方だけ条件が増えたときに「押しても何も起きないボタン」が静かに生まれる（@reviewer指摘）
  canSaveAsRoutine: boolean;
  hasRoutines: boolean;
  routinesLoaded: boolean;
  dismissed: boolean;
  // dismissedの永続値がAsyncStorageから復元済みか
  dismissLoaded: boolean;
};

/**
 * 完了サマリーの本文に「ルーティンとして保存」カードを出すか。
 *
 * ⋮メニューの項目より条件が厳しい。⋮は「フリー開始 かつ 種目がある」なら常に出すが、
 * 本文カードは画面の主役（達成感）を押しのけて割り込むため、**ルーティンをまだ1件も
 * 持っていない人にだけ**、しかも一度閉じられたら二度と出さない。
 *
 * ⋮だけに置かない理由は、いまの⋮が「記録を編集」から始まる副次操作の置き場でしかなく、
 * ユーザーが開く動機を持たないため。それだと一番届けたいルーティン未保有ユーザーに届かない。
 *
 * 2つの非同期（ルーティンの有無＝SQLite、dismissed＝AsyncStorage）が解決するまでは出さない。
 * 未解決を「0件」「未dismiss」と同じ扱いにすると、ルーティンを持っている人や既に閉じた人の
 * 画面にも一瞬カードが差し込まれる。
 */
export function shouldShowRoutineSavePrompt({
  canSaveAsRoutine,
  hasRoutines,
  routinesLoaded,
  dismissed,
  dismissLoaded,
}: Input): boolean {
  if (!canSaveAsRoutine) return false;
  if (!dismissLoaded || dismissed) return false;
  return routinesLoaded && !hasRoutines;
}
