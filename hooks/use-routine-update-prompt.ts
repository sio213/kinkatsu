import { useRoutineDiff } from '@/hooks/use-routine-diff';
import { formatRoutineDiffSummary } from '@/lib/routines/diff';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { useRoutineUpdatePromptStore } from '@/lib/workout/routine-update-prompt-store';
import { resolveRoutineUpdatePrompt } from '@/lib/workout/routine-update-prompt';
import { useRouter } from 'expo-router';

type Session = { id: number; routineId: number | null } | null | undefined;

/**
 * 完了サマリーの「ルーティンを更新」導線（⋮の項目と本文カードの両方）をまとめて扱う。
 * 「ルーティンとして保存」（hooks/use-routine-save-prompt.ts）と排他で、
 * ルーティンから開始したセッションではこちらが出る。
 */
export function useRoutineUpdatePrompt(session: Session, cards: SessionHistoryCard[] | 'error' | null) {
  const router = useRouter();
  const routineId = session?.routineId ?? null;
  // サマリー画面が既に取得済みのカードをそのまま渡す（同じクエリを2回叩かないため）
  const { diff, routineName } = useRoutineDiff(session?.id ?? null, routineId, cards);
  const dismissed = useRoutineUpdatePromptStore((state) => state.dismissed);
  const dismissLoaded = useRoutineUpdatePromptStore((state) => state.hydrated);
  const dismissPrompt = useRoutineUpdatePromptStore((state) => state.dismiss);

  const resolved = diff !== null && diff !== 'error' ? diff : null;
  const { canUpdateRoutine, showPrompt } = resolveRoutineUpdatePrompt({
    routineId,
    diff: resolved,
    dismissed,
    dismissLoaded,
  });

  const openDiffScreen = () => {
    if (routineId == null || session == null) return;
    router.push({
      pathname: '/routine/update/[id]',
      params: { id: String(routineId), sessionId: String(session.id) },
    });
  };

  return {
    canUpdateRoutine,
    showPrompt,
    routineName,
    summary: resolved ? formatRoutineDiffSummary(resolved) : '',
    openDiffScreen,
    dismissPrompt,
  };
}
