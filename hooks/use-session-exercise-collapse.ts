import type { Set as WorkoutSet } from '@/db/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type SessionExercise } from './use-workout-session';

// トレーニング画面の種目カードのアコーディオン開閉状態を持つ。開閉は基本的にユーザーの手動操作
// （カードヘッダーのタップ）に任せ、自動で畳むのは画面をマウントした時点で既に全セット完了して
// いた種目だけ。
//
// かつては「完了した種目を、次の種目カードに触れたタイミングで自動的に畳む」挙動もあったが、
// 畳むとカードの高さが減った分だけ操作中のカードが画面上で上にジャンプしてしまい、値を入力して
// いる最中に対象を見失う体験になっていたため撤去した（要件定義時のuser-advisor/designerの指摘）。
// 完了済みの種目で一覧が長くなるのが煩わしい場合は、ユーザーが自分のタイミングで畳める。
// あわせて「畳まれたカードのセットが未完了に戻ったら自動で再展開する」処理も落としている。
// 折りたたみ時のカード本体はdisplay:noneでヒットテストから外れる（session-exercise-card.tsx）ため、
// 畳まれたままセット追加や✓の取り消しに到達する経路自体が無く、再展開の出番が無いため。
//
// isActive（進行中セッション）の間だけこの初期折りたたみが働き、過去記録の閲覧（isActive: false）
// では常に全展開のまま（見返し用途では重量等をすぐ確認したいため、要件定義で決定）
export function useSessionExerciseCollapse(
  isActive: boolean,
  sessionExercises: SessionExercise[],
  sessionSets: Map<number, WorkoutSet[]>,
) {
  // カード側のローカルstateにすると、FlatListのvirtualizationでカードがアンマウント→再マウント
  // された際に開閉状態がリセットされてしまうため、この画面が生きている間は保持されるようここで持つ
  // （値未保存=展開中がデフォルト）
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  // 初期の折りたたみ判定を一度だけ走らせるためのフラグ。以降にセットが完了しても畳まない
  const hasInitializedRef = useRef(false);

  const toggleCollapsed = useCallback((sessionExerciseId: number) => {
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

  // 中断したセッションを再開したとき、既に終わっている種目まで全部展開されていると「どこまで
  // やったか」が見づらいため、初回だけ畳んだ状態にする。ユーザーが何かを操作している最中では
  // なくマウント直後の一度きりなので、自動折りたたみで問題になっていた「操作中のカードが
  // 画面上でずれる」現象は起きない
  useEffect(() => {
    if (!isActive || hasInitializedRef.current) return;
    // sessionExercisesとsessionSetsは別々のクエリで、どちらかが1テンポ遅れて届くことがある。
    // 片方だけ揃った時点で判定するとセット0件を「未完了」と誤判定してしまうため、両方が
    // 揃うまで初回判定を待つ。セットが1件も無いセッションはこの判定が走らないままになるが、
    // 種目カードのセットは必ず未確定（completedAt: null）で作られる（lib/workout/session.ts）
    // ため、待ち続けても畳むべき種目を取りこぼすことはない
    if (sessionExercises.length === 0 || sessionSets.size === 0) return;
    hasInitializedRef.current = true;

    const completedIds = sessionExercises
      .filter((item) => {
        const sets = sessionSets.get(item.sessionExerciseId);
        return sets != null && sets.length > 0 && sets.every((s) => s.completedAt != null);
      })
      .map((item) => item.sessionExerciseId);
    if (completedIds.length === 0) return;
    // 判定を待っている間もカードは描画されておりヘッダーはタップできるため、置き換えではなく
    // 既存の状態にマージする（先にユーザーが手動で畳んだものを消さない）
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of completedIds) next.add(id);
      return next;
    });
  }, [isActive, sessionExercises, sessionSets]);

  return { collapsedIds, toggleCollapsed };
}
