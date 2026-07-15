import type { Set as WorkoutSet } from '@/db/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { EMPTY_SETS, type SessionExercise } from './use-workout-session';

// トレーニング画面の種目カードのアコーディオン開閉状態と、完了済み種目の自動折りたたみを管理する。
// isActive（進行中セッション）の間だけ自動折りたたみが働き、過去記録の閲覧（isActive: false）では
// 常に全展開のまま（見返し用途では重量等をすぐ確認したいため、要件定義で決定）
export function useAutoCollapseCompletedExercises(
  isActive: boolean,
  sessionExercises: SessionExercise[],
  sessionSets: Map<number, WorkoutSet[]>,
) {
  // カード側のローカルstateにすると、FlatListのvirtualizationでカードがアンマウント→再マウント
  // された際に開閉状態がリセットされてしまうため、この画面が生きている間は保持されるようここで持つ
  // （値未保存=展開中がデフォルト）
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  // 手動で一度でもトグルした種目のid。自動折りたたみ（下のuseEffect）はここに含まれる種目には
  // 一切作用させない。ユーザーが意図的に開閉した後、勝手にまた畳まれる/開かれると「操作しても
  // 効かない」体験になるため（要件定義時のuser-advisor/designerの指摘）
  const manuallyToggledIdsRef = useRef<Set<number>>(new Set());
  // 種目カードの全セットが完了したかどうかを追跡する（下のuseEffectが更新）。過去に判定した
  // 完了状態と比較し、未完了→完了（自動折りたたみの予約）／完了→未完了（reopenSetによる
  // 自動再展開）の遷移エッジだけを見る
  const wasCompleteRef = useRef<Map<number, boolean>>(new Map());
  // 全セット完了により「畳む予約」がされた種目id。全セットが完了した瞬間に即座に畳むと
  // 「操作した結果が消えた」ように見えて不安を招くため、実際に畳むのは「別の種目カードに
  // 触れたタイミング」まで遅らせる（要件定義時のuser-advisor/designerの指摘）
  const pendingCollapseIdsRef = useRef<Set<number>>(new Set());
  // 画面を開いた（≒このセッションを再開した）時点で既に全セット完了していた種目を検知するための
  // フラグ。そうした種目は「今まさに完了させた」わけではないので、別カードに触れるのを待たず
  // 最初から畳んだ状態で表示する（designer/testerの指摘: 待たせると再開直後に不自然に見える）
  const hasInitializedRef = useRef(false);

  const toggleCollapsed = useCallback((sessionExerciseId: number) => {
    manuallyToggledIdsRef.current.add(sessionExerciseId);
    // 予約されたまま畳まれていない自動折りたたみがあれば、手動操作を優先して取り消す
    // （そうしないと、この後に別カードへ触れた際、古い予約に従って意図せず畳まれてしまう）
    pendingCollapseIdsRef.current.delete(sessionExerciseId);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionExerciseId)) {
        next.delete(sessionExerciseId);
      } else {
        next.add(sessionExerciseId);
      }
      return next;
    });
  }, []);

  // 「別の種目カードに触れた」タイミングで、畳む予約がされている他のカードを実際に畳む
  const handleInteract = useCallback((exceptSessionExerciseId: number) => {
    const pending = pendingCollapseIdsRef.current;
    const ids = [...pending].filter((id) => id !== exceptSessionExerciseId);
    if (ids.length === 0) return;
    for (const id of ids) pending.delete(id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const isInitialLoad = !hasInitializedRef.current && sessionExercises.length > 0;
    if (isInitialLoad) hasInitializedRef.current = true;

    const idsToCollapseImmediately: number[] = [];
    const idsToReExpand: number[] = [];

    for (const item of sessionExercises) {
      const sessionExerciseId = item.sessionExerciseId;
      const sets = sessionSets.get(sessionExerciseId) ?? EMPTY_SETS;
      const isComplete = sets.length > 0 && sets.every((s) => s.completedAt != null);
      const wasComplete = wasCompleteRef.current.get(sessionExerciseId) ?? false;
      wasCompleteRef.current.set(sessionExerciseId, isComplete);
      if (isComplete === wasComplete) continue;
      if (manuallyToggledIdsRef.current.has(sessionExerciseId)) continue;

      if (isComplete) {
        if (isInitialLoad) {
          idsToCollapseImmediately.push(sessionExerciseId);
        } else {
          pendingCollapseIdsRef.current.add(sessionExerciseId);
        }
      } else {
        // reopenSetやセット追加で未完了に戻った種目は、畳まれる前ならまだ予約を取り消すだけで
        // よく、既に畳まれていた場合はLayoutAnimation付きで即座に再展開する
        pendingCollapseIdsRef.current.delete(sessionExerciseId);
        idsToReExpand.push(sessionExerciseId);
      }
    }

    if (idsToCollapseImmediately.length === 0 && idsToReExpand.length === 0) return;
    if (idsToReExpand.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToCollapseImmediately) next.add(id);
      for (const id of idsToReExpand) next.delete(id);
      return next;
    });
  }, [isActive, sessionExercises, sessionSets]);

  return { collapsedIds, toggleCollapsed, handleInteract };
}
