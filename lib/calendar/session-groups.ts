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

// 今日パネル専用。実績セッション（groupCardsBySessionの出力）と予定（ルーティン紐付き
// リマインダー由来、2026-07-19確定でPR8の時間帯グループ機構を延長する方針）を同じ
// 時系列リストに混ぜて時刻順に並べる。予定側のsortAtは「その日のhour:minute」から
// 組み立てるため、呼び出し側は年月日（selectedDateの0時起点）を渡す
export type TodayTimelineEntry<TSession, TSchedule> =
  | { kind: 'session'; key: string; sortAt: number; group: SessionGroup<TSession> }
  | { kind: 'schedule'; key: string; sortAt: number; card: TSchedule };

export function buildTodayTimeline<TSession, TSchedule extends { reminderId: number; hour: number; minute: number }>(
  sessionGroups: SessionGroup<TSession>[],
  scheduleCards: TSchedule[],
  dayStart: number,
): TodayTimelineEntry<TSession, TSchedule>[] {
  const sessionEntries: TodayTimelineEntry<TSession, TSchedule>[] = sessionGroups.map((group) => ({
    kind: 'session',
    key: `session-${group.sessionId}`,
    sortAt: group.sessionStartedAt,
    group,
  }));
  const scheduleEntries: TodayTimelineEntry<TSession, TSchedule>[] = scheduleCards.map((card) => ({
    kind: 'schedule',
    key: `schedule-${card.reminderId}`,
    sortAt: dayStart + card.hour * 3_600_000 + card.minute * 60_000,
    card,
  }));
  return [...sessionEntries, ...scheduleEntries].sort((a, b) => a.sortAt - b.sortAt);
}
