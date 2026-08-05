import { resolveMeasurementType } from '@/lib/exercises/constants';
import { compareToPrevious, type SetComparison } from '@/lib/workout/comparison';
import {
  computePersonalBestIds,
  getExerciseHistoryEntries,
  getSessionExerciseCards,
  NO_SESSION_TO_EXCLUDE,
  type SessionHistoryCard,
} from '@/lib/workout/history';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

// 記録済みセッションの種目1件。コンポーネントのSessionExerciseCard
// （components/workout/session-exercise-card.tsx＝トレーニング中の編集可能カード）とは別物なので、
// 名前を衝突させないこと
export type RecordedExerciseCard = SessionHistoryCard & {
  sessionId: number;
  // 同日複数セッションの時間帯グループ分け（朝/昼/夕方/夜）に使う、そのカードが属する
  // セッションの開始時刻。sessionIdと同様getSessionExerciseCardsの戻り値には無いため付与する
  sessionStartedAt: number;
  isBest: boolean;
  // 直前の同種目セッションとの比較（前回比較数値）。比較対象が無い/変化なしならnull
  comparison: SetComparison | null;
};

export type UseSessionExerciseCardsResult = {
  // null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）
  // （session-history-load-view.tsxと同じ三値管理）
  cards: RecordedExerciseCard[] | 'error' | null;
  // 取得失敗時に「再試行」ボタンから明示的に再取得するための関数（対象セッションが変わらない
  // 限り自動では再実行されないため）。フックの内部でも画面再フォーカス時に同じ仕組みで呼ばれる
  retry: () => void;
};

/**
 * 指定したセッション群の種目カードを、自己ベスト判定・前回比較つきでまとめて返す。
 * カレンダーの選択日パネル（その日のセッション全部）と完了サマリー（終えたセッション1件）で共通。
 *
 * getSessionExerciseCardsにincludeUnconfirmedCards:trueを渡しており、✓未確定セットのみの
 * カード（月グリッドの実績マーカーと表示対象を揃えるため）も含む点が「読み込む種目を選ぶ」画面
 * （確定セットを持つカードのみ）と異なる。実施していない種目を出したくない呼び出し側は、
 * 受け取った後に確定セットの有無で絞ること。
 *
 * 各カードの中身（種目・セット・自己ベスト・前回比較）は一括取得を都度実行する一時点の
 * スナップショットで、live query化はしていない（bestCardIds算出のために種目ごとの全履歴取得まで
 * 要る複雑な非同期集計のため、単純なuseLiveQueryのクエリ購読には素直に落とし込めない）。
 * その代わり、呼び出し元の画面が再フォーカスされたタイミング（下のuseFocusEffect）で明示的に
 * 再取得する。過去記録編集画面(app/workout/[id].tsx)から「戻る」で復帰した際に編集内容が
 * すぐ反映されない、というバグの原因だった（@ユーザー指摘、2026-07-21修正。このアプリは
 * ローカルDBのみで外部からの書き込みが発生しないため、「編集→この画面に戻る」という画面遷移
 * そのものが唯一のデータ変化点であり、再フォーカス時の再取得で正しく（かつライブ購読より
 * ずっと安価に）実運用上のケースを網羅できる）。
 *
 * sessionsは毎レンダー新しい配列参照でよい。中身のidが変わらない限り再取得しない
 */
export function useSessionExerciseCards(
  sessions: { id: number; startedAt: number }[],
): UseSessionExerciseCardsResult {
  // 依存配列の安定化用キー。sessionsは中身が同じでも毎レンダー新しい配列参照になり得るため、
  // このkeyをeffectの依存にすることで中身が変わらない限り再実行されないようにする
  // （sessions自体はeffect内でそのまま参照する。exhaustive-depsはkeyで代替しているため無効化する）
  const sessionIdsKey = sessions.map((s) => s.id).join(',');
  // retryToken: 「再試行」ボタン押下、または画面再フォーカス（下のuseFocusEffect）のたびに
  // インクリメントし、sessionIdsKeyが同じでもeffectを再実行させるためのトリガー
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  // 初回マウント時のフォーカスは下のeffect（sessionIdsKey依存）が既に取得を担うため、
  // 二重取得を避けて最初の1回だけスキップする
  const isFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      retry();
    }, [retry]),
  );

  // **どのセッション集合に対する結果なのかをキーで持つ。** 配列だけを持つと、対象が変わった
  // 直後の1フレームに前の対象の結果が描かれてしまう。effectでnullに戻す方式ではレンダーの後に
  // なるため間に合わない。カレンダーでは「日付を切り替えた瞬間に前日のカードが新しい日付見出しの
  // 下に一瞬並ぶ」、完了サマリーでは「セッションの解決前に確定した空配列がそのまま残り、
  // 『実施した種目 全0件』が一瞬見える」という形で出る（@reviewer指摘、実測）
  const [state, setState] = useState<{ key: string; value: RecordedExerciseCard[] | 'error' } | null>(
    null,
  );

  useEffect(() => {
    // 対象セッションが無い場合は取得処理そのものが不要なので、ローディング状態を経由せず
    // 同期的に空配列を確定する（一瞬スピナーが出てすぐ消えるちらつきを防ぐ）
    if (sessions.length === 0) {
      setState({ key: sessionIdsKey, value: [] });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // getSessionExerciseCardsの戻り値にはsessionId/sessionStartedAtが含まれないため、
        // 前回比較の「自分自身のセッションを除外する」判定・時間帯グループ分けに使えるよう
        // ここでカードへ付与しておく
        const cardsBySession = await Promise.all(
          sessions.map(async ({ id: sessionId, startedAt: sessionStartedAt }) => {
            const cards = await getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true });
            return cards.map((c) => ({ ...c, sessionId, sessionStartedAt }));
          }),
        );
        const cards = cardsBySession.flat();

        // 種目ごとに履歴全件（✓確定セットを持つカードのみ、new順）を取り、自己ベストの
        // カードidを集める（同じ種目が複数カードあっても履歴取得は種目単位で1回で済ませる）。
        // 前回比較もこの同じ履歴（確定セットのみ）を基準にすることで、自己ベスト判定と
        // 前回比較で「確定/未確定」の基準がズレないようにする
        const uniqueExerciseIds = [...new Set(cards.map((c) => c.exerciseId))];
        const bestCardIds = new Set<number>();
        const entriesByExerciseId = new Map<number, Awaited<ReturnType<typeof getExerciseHistoryEntries>>>();
        await Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => {
            const sample = cards.find((c) => c.exerciseId === exerciseId)!;
            const measurementType = resolveMeasurementType(sample.measurementType);
            // NO_SESSION_TO_EXCLUDE: ここでは「今表示中の記録自身」も自己ベスト比較に含めたい
            // （元々の用途はルーティン編集画面のようにセッション概念が無い場面向けの番兵だが、
            // 「除外セッションなし＝全履歴を対象にする」という意味は今回の用途にもそのまま合致する）
            const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);
            entriesByExerciseId.set(exerciseId, entries);
            for (const id of computePersonalBestIds(entries, measurementType)) bestCardIds.add(id);
          }),
        );

        // カードごとに直前の同種目セッションと比較する。「直前」は自分自身が属するsessionId
        // を除外するだけでは不十分で、時刻で見て厳密に自分より前（startedAt未満）のエントリに
        // 限定する必要がある。同日に複数セッションがある場合（時間帯グループ機能で一般的になった）、
        // sessionIdだけで除外すると朝カードの「前回」が時系列的に後の同日夜セッションになって
        // しまうバグがあったため（PR8で発覚）、sessionId除外に加えstartedAt未満の条件も併せて課す
        const resultCards = cards.map((c) => {
          const confirmedSets = c.sets.filter((s) => s.completedAt != null);
          const measurementType = resolveMeasurementType(c.measurementType);
          const entries = entriesByExerciseId.get(c.exerciseId) ?? [];
          const previousEntry = entries.find((e) => e.sessionId !== c.sessionId && e.startedAt < c.sessionStartedAt);
          const previousSets = previousEntry ? previousEntry.sets.filter((s) => s.completedAt != null) : [];
          const comparison = compareToPrevious(measurementType, confirmedSets, previousSets);
          return { ...c, isBest: bestCardIds.has(c.workoutSessionExerciseId), comparison };
        });

        if (!cancelled) {
          setState({ key: sessionIdsKey, value: resultCards });
        }
      } catch (e) {
        console.error('[session exercise cards]', e);
        if (!cancelled) setState({ key: sessionIdsKey, value: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdsKey, retryToken]);

  // 対象が変わった直後は、まだ前の対象の結果しか持っていない。レンダー時に照合して
  // 読み込み中（null）に倒す。既に表示中のカードがある状態での再取得（画面再フォーカス、
  // 2026-07-21追加）ではキーが変わらないため、前回の結果を表示したまま保持し、
  // 取得完了時に差し替える（無条件にnullへ戻すと、画面に戻るたびに一瞬スピナーへ
  // 差し替わってからカードが出直すチラつきになる。@reviewer Major指摘）
  const cards = state?.key === sessionIdsKey ? state.value : null;

  return { cards, retry };
}
