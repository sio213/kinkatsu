// 選択日パネルで同日複数セッションを時間帯ごとに分けて表示するための純粋関数。
// セッション単位（sessionId）でグルーピングし、開始時刻の早い順に並べる
// （デザイン案「複数03: 複数予定（3件・時刻順）」と同じ「時刻順」の原則）
export type SessionGroup<T> = {
  sessionId: number;
  sessionStartedAt: number;
  cards: T[];
};

export function groupCardsBySession<T extends { sessionId: number; sessionStartedAt: number }>(
  cards: T[],
): SessionGroup<T>[] {
  const groups = new Map<number, SessionGroup<T>>();
  for (const card of cards) {
    let group = groups.get(card.sessionId);
    if (!group) {
      group = { sessionId: card.sessionId, sessionStartedAt: card.sessionStartedAt, cards: [] };
      groups.set(card.sessionId, group);
    }
    group.cards.push(card);
  }
  return [...groups.values()].sort((a, b) => a.sessionStartedAt - b.sessionStartedAt);
}
