import { createPromptDismissStore } from '@/lib/workout/prompt-dismiss-store';

/**
 * 「このメニューをルーティンとして保存」カードの「今後表示しない」。
 *
 * ルーティンを一生作らないタイプのユーザー——その日の体調で種目を決める人・種目をまだ
 * 探索中の人——に、トレーニングを終えるたび毎回勧誘が出るのを防ぐのが目的で、
 * 1回閉じたら二度と出さない。
 *
 * カード自体はルーティンを1件でも持っていれば出ないため、このフラグが効くのは
 * 「ルーティンを作らないまま閉じた人」だけ。⋮メニューの「ルーティンとして保存」は残るので、
 * 閉じた後に気が変わってもそこから辿れる。
 *
 * 「ルーティンを更新」カードとは**別のキー**で持つ（lib/workout/prompt-dismiss-store.ts参照）。
 */
export const useRoutineSavePromptStore = createPromptDismissStore('routine-save-prompt');
