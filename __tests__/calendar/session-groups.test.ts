import { buildTodayTimeline, groupCardsBySession } from '@/lib/calendar/session-groups';

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

describe('buildTodayTimeline', () => {
  const dayStart = new Date(2026, 6, 20).getTime();

  // keyはmergeScheduleCards(lib/calendar/schedule.ts)が発行する'reminder-*'/'manual-*'を模す
  // （PR10-4でreminderId専用からkeyベースへ汎化したため、テスト側もkeyを直接渡す形にする）
  it('実績セッションと予定を時刻順に混ぜる', () => {
    const sessionGroups = groupCardsBySession([
      card({ sessionId: 1, sessionStartedAt: dayStart + 19 * 3_600_000, name: '夜の実績' }), // 19:00
    ]);
    const scheduleCards = [{ key: 'reminder-100', hour: 7, minute: 0, routineName: '朝の予定' }];
    const timeline = buildTodayTimeline(sessionGroups, scheduleCards, dayStart);
    expect(timeline.map((e) => e.kind)).toEqual(['schedule', 'session']);
  });

  it('予定側のsortAtはdayStart+hour:minuteから組み立てられる', () => {
    const scheduleCards = [{ key: 'reminder-1', hour: 20, minute: 30, routineName: 'x' }];
    const timeline = buildTodayTimeline([], scheduleCards, dayStart);
    expect(timeline[0].sortAt).toBe(dayStart + 20 * 3_600_000 + 30 * 60_000);
  });

  it('セッション・予定とも0件なら空配列', () => {
    expect(buildTodayTimeline([], [], dayStart)).toEqual([]);
  });

  it('セッション・予定それぞれ複数件あっても正しく時刻順にマージされる', () => {
    const sessionGroups = groupCardsBySession([
      card({ sessionId: 1, sessionStartedAt: dayStart + 12 * 3_600_000, name: '昼の実績' }),
    ]);
    const scheduleCards = [
      { key: 'reminder-1', hour: 19, minute: 0, routineName: '夜の予定' },
      { key: 'reminder-2', hour: 7, minute: 0, routineName: '朝の予定' },
    ];
    const timeline = buildTodayTimeline(sessionGroups, scheduleCards, dayStart);
    expect(timeline.map((e) => e.key)).toEqual(['reminder-2', 'session-1', 'reminder-1']);
  });

  it('各エントリのkeyはカード自身のkeyがそのまま使われ、sessionIdの値域と重複しても衝突しない', () => {
    const sessionGroups = groupCardsBySession([
      card({ sessionId: 1, sessionStartedAt: dayStart + 7 * 3_600_000, name: 'A' }),
    ]);
    const scheduleCards = [{ key: 'reminder-1', hour: 19, minute: 0, routineName: 'x' }];
    const timeline = buildTodayTimeline(sessionGroups, scheduleCards, dayStart);
    const keys = timeline.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('手動予定（manual-*キー）もリマインダー予定と同じく統合できる（PR10-4）', () => {
    const sessionGroups = groupCardsBySession([
      card({ sessionId: 1, sessionStartedAt: dayStart + 12 * 3_600_000, name: '昼の実績' }),
    ]);
    const scheduleCards = [
      { key: 'reminder-1', hour: 7, minute: 0, routineName: '朝の予定' },
      { key: 'manual-9', hour: 19, minute: 0, routineName: '夜の手動予定' },
    ];
    const timeline = buildTodayTimeline(sessionGroups, scheduleCards, dayStart);
    expect(timeline.map((e) => e.key)).toEqual(['reminder-1', 'session-1', 'manual-9']);
  });

  it('予定同士のsortAtが完全一致する場合も、渡した配列の順序を維持する（Array.sortの安定性への依存を明示するテスト、PR10-4）', () => {
    const scheduleCards = [
      { key: 'reminder-1', hour: 7, minute: 0, routineName: 'A' },
      { key: 'manual-9', hour: 7, minute: 0, routineName: 'B' },
    ];
    const timeline = buildTodayTimeline([], scheduleCards, dayStart);
    expect(timeline.map((e) => e.key)).toEqual(['reminder-1', 'manual-9']);
  });

  it('セッションと予定のsortAtが完全一致する場合、セッションが先に来る（Array.sortの安定性への暗黙依存を固定する回帰テスト）', () => {
    const sessionGroups = groupCardsBySession([
      card({ sessionId: 1, sessionStartedAt: dayStart + 7 * 3_600_000, name: 'A' }),
    ]);
    const scheduleCards = [{ key: 'reminder-1', hour: 7, minute: 0, routineName: 'x' }];
    const timeline = buildTodayTimeline(sessionGroups, scheduleCards, dayStart);
    expect(timeline.map((e) => e.key)).toEqual(['session-1', 'reminder-1']);
  });
});
