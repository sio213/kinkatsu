import { createPromptDismissStore } from '@/lib/workout/prompt-dismiss-store';

/**
 * 「『{ルーティン名}』の内容が変わっています」カードの「今後表示しない」。
 *
 * 「ルーティンを実績に合わせない」という好みは安定しているため、
 * 「しばらく表示しない」ではなく永続にする（30日後に戻ってくる方が迷惑になる）。
 *
 * ただし保存側と違い、このフラグは自己解決しない（保存側はルーティンを1件作れば
 * 表示条件から外れる）。そのため**実際にルーティンの更新を完了したら解除する**
 * ——「今後表示しない」は「同期しない」という表明なので、後から実際に更新したなら
 * 撤回したと読む。誤タップの救済も兼ねる（⋮は開かれにくいので安全網にはできない）。
 */
export const useRoutineUpdatePromptStore = createPromptDismissStore('routine-update-prompt');
