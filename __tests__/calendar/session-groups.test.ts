import { groupCardsBySession } from '@/lib/calendar/session-groups';

type TestCard = { sessionId: number; sessionStartedAt: number; name: string };

function card(overrides: Partial<TestCard> = {}): TestCard {
  return { sessionId: 1, sessionStartedAt: 0, name: 'ベンチプレス', ...overrides };
}

describe('groupCardsBySession', () => {
  it('同じsessionIdのカードは1つのグループにまとまる', () => {
    const cards = [
      card({ sessionId: 1, sessionStartedAt: 100, name: 'A' }),
      card({ sessionId: 1, sessionStartedAt: 100, name: 'B' }),
    ];
    const groups = groupCardsBySession(cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('異なるsessionIdは別グループになり、開始時刻の早い順に並ぶ', () => {
    const cards = [
      card({ sessionId: 2, sessionStartedAt: 2000, name: 'evening' }),
      card({ sessionId: 1, sessionStartedAt: 1000, name: 'morning' }),
    ];
    const groups = groupCardsBySession(cards);
    expect(groups.map((g) => g.sessionId)).toEqual([1, 2]);
    expect(groups.map((g) => g.cards[0].name)).toEqual(['morning', 'evening']);
  });

  it('各グループはsessionStartedAtを保持する', () => {
    const cards = [card({ sessionId: 1, sessionStartedAt: 12345 })];
    const groups = groupCardsBySession(cards);
    expect(groups[0].sessionStartedAt).toBe(12345);
  });

  it('空配列なら空配列を返す', () => {
    expect(groupCardsBySession([])).toEqual([]);
  });

  it('3セッション以上でも開始時刻の早い順に並ぶ', () => {
    const cards = [
      card({ sessionId: 3, sessionStartedAt: 3000, name: 'C' }),
      card({ sessionId: 1, sessionStartedAt: 1000, name: 'A' }),
      card({ sessionId: 2, sessionStartedAt: 2000, name: 'B' }),
    ];
    const groups = groupCardsBySession(cards);
    expect(groups.map((g) => g.sessionId)).toEqual([1, 2, 3]);
  });

  it('同一sessionIdのカードが入力配列内で非連続でも、そのグループ内の順序は入力順を保つ', () => {
    const cards = [
      card({ sessionId: 1, sessionStartedAt: 100, name: 'A1' }),
      card({ sessionId: 2, sessionStartedAt: 200, name: 'B1' }),
      card({ sessionId: 1, sessionStartedAt: 100, name: 'A2' }),
    ];
    const groups = groupCardsBySession(cards);
    const groupA = groups.find((g) => g.sessionId === 1)!;
    expect(groupA.cards.map((c) => c.name)).toEqual(['A1', 'A2']);
  });
});
