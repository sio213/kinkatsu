import { useHasRoutines } from '@/hooks/use-routines';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { buildRoutineNameFromExercises } from '@/lib/routines/naming';
import { historyCardsToDraftExercises } from '@/lib/routines/validation';
import { useRoutineSavePromptStore } from '@/lib/workout/routine-save-prompt-store';
import { shouldShowRoutineSavePrompt } from '@/lib/workout/routine-save-prompt';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { useRouter } from 'expo-router';

type Session = { routineId: number | null } | null | undefined;

/**
 * 完了サマリーの「ルーティンとして保存」（⋮の項目と本文カードの両方）をまとめて扱う。
 *
 * 画面側に置くと、下書きストア・ルーティン保有・dismissフラグ・遷移という1つの関心事の
 * 部品が8つ散らばる（@reviewer指摘）。⋮と本文カードで同じ保存処理・重なる表示条件を
 * 共有するため、ここで1箇所に閉じる。
 */
export function useRoutineSavePrompt(session: Session, cards: SessionHistoryCard[] | 'error' | null) {
  const router = useRouter();
  const seedDraft = useRoutineDraftStore((state) => state.seed);
  const { hasRoutines, loaded: routinesLoaded } = useHasRoutines();
  const dismissed = useRoutineSavePromptStore((state) => state.dismissed);
  const dismissLoaded = useRoutineSavePromptStore((state) => state.hydrated);
  const dismissPrompt = useRoutineSavePromptStore((state) => state.dismiss);

  const cardList = Array.isArray(cards) ? cards : [];

  // ルーティンから開始したセッションでは出さない。同じ内容のルーティンが二重にできるため
  // （そちらは「ルーティンを更新」として別途扱う）。カードが未取得・取得失敗・0件のときも、
  // 積む種目が無いので出さない
  const canSaveAsRoutine = session?.routineId == null && cardList.length > 0;

  // 保存そのものはここでは行わず、ルーティン新規作成フォームに種目を入れた状態で着地させる
  // （名前を付けさせる必要があり、不要な種目もそこで間引けるため）。
  //
  // 積むのはhydrateではなくseed（＝空の下書きから作り直す）。hydrateが差し替えるのは種目だけで、
  // 前の下書きのリマインダー設定（reminderEnabled/reminder）はそのまま残るため、
  // 「以前ルーティンを作りかけてやめたときのリマインダー」を引き継いだ状態で着地してしまう
  const saveAsRoutine = () => {
    if (cardList.length === 0) return;
    seedDraft(historyCardsToDraftExercises(cardList));
    router.push({
      pathname: '/routine/new',
      // keepDraftを立てないと、着地した/routine/newがマウント時のresetで今積んだ種目を消す
      params: { keepDraft: '1', name: buildRoutineNameFromExercises(cardList) },
    });
  };

  return {
    canSaveAsRoutine,
    // 本文カードは⋮より条件が厳しい（ルーティン未保有・未dismissのときだけ）
    showPrompt: shouldShowRoutineSavePrompt({
      canSaveAsRoutine,
      hasRoutines,
      routinesLoaded,
      dismissed,
      dismissLoaded,
    }),
    saveAsRoutine,
    dismissPrompt,
  };
}
