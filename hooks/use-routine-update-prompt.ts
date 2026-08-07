import { useRoutineDiff } from '@/hooks/use-routine-diff';
import { diffTotalCount, formatRoutineDiffSummary } from '@/lib/routines/diff';
import { useRoutineUpdatePromptStore } from '@/lib/workout/routine-update-prompt-store';
import { useRouter } from 'expo-router';

type Session = { id: number; routineId: number | null } | null | undefined;

/**
 * 完了サマリーの「ルーティンを更新」導線（⋮の項目と本文カードの両方）をまとめて扱う。
 * 「ルーティンとして保存」（hooks/use-routine-save-prompt.ts）と排他で、
 * ルーティンから開始したセッションではこちらが出る。
 */
export function useRoutineUpdatePrompt(session: Session) {
  const router = useRouter();
  const routineId = session?.routineId ?? null;
  const { diff, routineName } = useRoutineDiff(session?.id ?? null, routineId);
  const dismissed = useRoutineUpdatePromptStore((state) => state.dismissed);
  const dismissLoaded = useRoutineUpdatePromptStore((state) => state.hydrated);
  const dismissPrompt = useRoutineUpdatePromptStore((state) => state.dismiss);

  const resolved = diff !== null && diff !== 'error' ? diff : null;

  // ⋮の項目は差分が1件以上あれば出す（未実施だけでも出す）。自分から開いた人には見せてよいのと、
  // 「やらなくなった種目をルーティンから外したい」という正当な用途もあるため
  const canUpdateRoutine = routineId != null && resolved != null && diffTotalCount(resolved) > 0;

  // 本文カードは「追加した種目 または 値の変更」が1件以上のときだけ。未実施しか差分が無い日
  // （時間切れで最後の1種目を飛ばした日）に出すと、開いても1行・既定オフで何もすることがなく、
  // 実質「この種目をルーティンから消しませんか」という示唆だけが残る
  const hasActionableDiff = resolved != null && resolved.added.length + resolved.changed.length > 0;

  const openDiffScreen = () => {
    if (routineId == null || session == null) return;
    router.push({
      pathname: '/routine/update/[id]',
      params: { id: String(routineId), sessionId: String(session.id) },
    });
  };

  return {
    canUpdateRoutine,
    // 未dismissかつ復元済みのときだけ出す（復元を待たないと、閉じたはずのユーザーに
    // 数フレーム差し込まれる）
    showPrompt: canUpdateRoutine && hasActionableDiff && dismissLoaded && !dismissed,
    routineName,
    summary: resolved ? formatRoutineDiffSummary(resolved) : '',
    openDiffScreen,
    dismissPrompt,
  };
}
