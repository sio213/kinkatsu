import { diffTotalCount, type RoutineDiff } from '@/lib/routines/diff';

type Input = {
  // セッションの出自。ルーティンから開始したものだけが更新の対象
  routineId: number | null | undefined;
  // 解決済みの差分。未解決・取得失敗ならnull
  diff: RoutineDiff | null;
  dismissed: boolean;
  dismissLoaded: boolean;
};

/**
 * 完了サマリーの「ルーティンを更新」導線を出すか。⋮と本文カードで条件が違う。
 *
 * - ⋮ … 差分が1件以上あれば出す（未実施だけでも出す）。自分から開いた人には見せてよいのと、
 *   「やらなくなった種目をルーティンから外したい」という正当な用途もあるため
 * - 本文カード … さらに「追加した種目 または 値の変更」が1件以上のときだけ。未実施しか差分が
 *   無い日（時間切れで最後の1種目を飛ばした日）に出しても、開いたら1行・既定オフで
 *   何もすることがなく、実質「この種目をルーティンから消しませんか」という示唆だけが残る
 *
 * 「本文カードが出るなら⋮にも必ず項目がある」という包含関係を、カード側の条件が
 * ⋮側の結果を受け取る形にすることで構造的に保証する
 * （lib/workout/routine-save-prompt.tsと同じ組み立て）。
 */
export function resolveRoutineUpdatePrompt({ routineId, diff, dismissed, dismissLoaded }: Input): {
  canUpdateRoutine: boolean;
  showPrompt: boolean;
} {
  const canUpdateRoutine = routineId != null && diff != null && diffTotalCount(diff) > 0;
  const hasActionableDiff = diff != null && diff.added.length + diff.changed.length > 0;

  return {
    canUpdateRoutine,
    // dismissedの復元を待たないと、閉じたはずのユーザーに数フレーム差し込まれる
    showPrompt: canUpdateRoutine && hasActionableDiff && dismissLoaded && !dismissed,
  };
}
