import {
  formatMonthGroup,
  formatRelativeDaysAgo,
  formatSessionDateGroup,
  formatSessionDuration,
  formatShortDate,
  groupByMonth,
  groupSessionsByDate,
} from '@/lib/workout/summary';

describe('formatSessionDuration', () => {
  it('endedAtがある場合はstartedAtとの差を分単位で返す', () => {
    expect(formatSessionDuration(0, 45 * 60_000)).toBe('45分');
  });

  it('endedAtが無い場合（進行中）はnow基準で計算する', () => {
    expect(formatSessionDuration(0, null, 10 * 60_000)).toBe('10分');
  });

  it('負の経過時間にはならない（クロック補正等の異常値をガード）', () => {
    expect(formatSessionDuration(10_000, 0)).toBe('0分');
  });

  it('Math.roundの仕様通り、29.5分ちょうどは30分に切り上がる', () => {
    expect(formatSessionDuration(0, 29.5 * 60_000)).toBe('30分');
  });
});

describe('formatSessionDateGroup / groupSessionsByDate', () => {
  it('日付を「M月D日（曜）」形式にする', () => {
    // 2026-07-03 は金曜日
    const ts = new Date(2026, 6, 3, 12, 0).getTime();
    expect(formatSessionDateGroup(ts)).toBe('7月3日（金）');
  });

  it('同じ日付が連続するセッションを1グループにまとめる', () => {
    const day1a = new Date(2026, 6, 3, 9, 0).getTime();
    const day1b = new Date(2026, 6, 3, 18, 0).getTime();
    const day2 = new Date(2026, 6, 1, 9, 0).getTime();
    const sessions = [
      { id: 1, startedAt: day1a },
      { id: 2, startedAt: day1b },
      { id: 3, startedAt: day2 },
    ];
    const groups = groupSessionsByDate(sessions);
    expect(groups).toHaveLength(2);
    expect(groups[0].dateLabel).toBe('7月3日（金）');
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[1].dateLabel).toBe('7月1日（水）');
    expect(groups[1].sessions).toHaveLength(1);
  });

  it('年をまたいで同じ月日が隣接しても別グループとして扱う', () => {
    const jan1_2026 = new Date(2026, 0, 1, 9, 0).getTime();
    const jan1_2025 = new Date(2025, 0, 1, 9, 0).getTime();
    // 降順（新しい方が先頭）で隣接している想定
    const groups = groupSessionsByDate([
      { id: 1, startedAt: jan1_2026 },
      { id: 2, startedAt: jan1_2025 },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('同日のセッションが配列中で非連続（降順ソート済みという前提が崩れている）場合は別グループに分裂する', () => {
    const dayA1 = new Date(2026, 6, 3, 9, 0).getTime();
    const dayB = new Date(2026, 6, 1, 9, 0).getTime();
    const dayA2 = new Date(2026, 6, 3, 18, 0).getTime();
    const groups = groupSessionsByDate([
      { id: 1, startedAt: dayA1 },
      { id: 2, startedAt: dayB },
      { id: 3, startedAt: dayA2 },
    ]);
    expect(groups).toHaveLength(3);
  });

  it('空配列 → 空配列', () => {
    expect(groupSessionsByDate([])).toEqual([]);
  });
});

describe('formatRelativeDaysAgo', () => {
  const now = new Date(2026, 6, 7, 12, 0).getTime(); // 2026-07-07

  it('同じ日は「今日」', () => {
    const today = new Date(2026, 6, 7, 8, 0).getTime();
    expect(formatRelativeDaysAgo(today, now)).toBe('今日');
  });

  it('同日内の未来時刻（クロックのわずかなずれ等）でも「今日」のまま', () => {
    const laterToday = new Date(2026, 6, 7, 23, 0).getTime();
    expect(formatRelativeDaysAgo(laterToday, now)).toBe('今日');
  });

  it('1日前は「昨日」', () => {
    const yesterday = new Date(2026, 6, 6, 8, 0).getTime();
    expect(formatRelativeDaysAgo(yesterday, now)).toBe('昨日');
  });

  it('2〜5日前は「N日前」', () => {
    expect(formatRelativeDaysAgo(new Date(2026, 6, 5, 8, 0).getTime(), now)).toBe('2日前');
    expect(formatRelativeDaysAgo(new Date(2026, 6, 4, 8, 0).getTime(), now)).toBe('3日前');
    expect(formatRelativeDaysAgo(new Date(2026, 6, 3, 8, 0).getTime(), now)).toBe('4日前');
    expect(formatRelativeDaysAgo(new Date(2026, 6, 2, 8, 0).getTime(), now)).toBe('5日前');
  });

  it('6日前ちょうどはnull（絶対日付のみ表示させる境界）', () => {
    const sixDaysAgo = new Date(2026, 6, 1, 8, 0).getTime();
    expect(formatRelativeDaysAgo(sixDaysAgo, now)).toBeNull();
  });

  it('7日以上前もnull', () => {
    const aWeekAgo = new Date(2026, 5, 30, 8, 0).getTime();
    expect(formatRelativeDaysAgo(aWeekAgo, now)).toBeNull();
  });

  it('日付境界をまたぐ時刻差（23:59→翌0:01）でも正しく「昨日」判定する', () => {
    const lateNight = new Date(2026, 6, 6, 23, 59).getTime();
    const justAfterMidnight = new Date(2026, 6, 7, 0, 1).getTime();
    expect(formatRelativeDaysAgo(lateNight, justAfterMidnight)).toBe('昨日');
  });

  it('年末年始をまたいでも1日前は「昨日」', () => {
    const dec31 = new Date(2025, 11, 31, 8, 0).getTime();
    const jan1 = new Date(2026, 0, 1, 8, 0).getTime();
    expect(formatRelativeDaysAgo(dec31, jan1)).toBe('昨日');
  });

  it('nowを省略した場合はDate.now()基準になる', () => {
    expect(formatRelativeDaysAgo(Date.now())).toBe('今日');
  });
});

describe('formatMonthGroup / groupByMonth', () => {
  it('「YYYY年M月」形式にする', () => {
    const ts = new Date(2026, 6, 3, 12, 0).getTime();
    expect(formatMonthGroup(ts)).toBe('2026年7月');
  });

  it('同じ月の項目を1グループにまとめる', () => {
    const a = new Date(2026, 6, 3, 9, 0).getTime();
    const b = new Date(2026, 6, 1, 9, 0).getTime();
    const c = new Date(2026, 5, 26, 9, 0).getTime();
    const groups = groupByMonth([{ startedAt: a }, { startedAt: b }, { startedAt: c }]);
    expect(groups).toHaveLength(2);
    expect(groups[0].monthLabel).toBe('2026年7月');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].monthLabel).toBe('2026年6月');
    expect(groups[1].items).toHaveLength(1);
  });

  it('年をまたいで同じ月（例:2025年7月と2026年7月）を誤って同一グループにしない', () => {
    const july2026 = new Date(2026, 6, 1, 9, 0).getTime();
    const july2025 = new Date(2025, 6, 1, 9, 0).getTime();
    const groups = groupByMonth([{ startedAt: july2026 }, { startedAt: july2025 }]);
    expect(groups).toHaveLength(2);
  });

  it('同月の項目が配列中で非連続の場合は別グループに分裂する', () => {
    const julyA = new Date(2026, 6, 3, 9, 0).getTime();
    const june = new Date(2026, 5, 26, 9, 0).getTime();
    const julyB = new Date(2026, 6, 1, 9, 0).getTime();
    const groups = groupByMonth([{ startedAt: julyA }, { startedAt: june }, { startedAt: julyB }]);
    expect(groups).toHaveLength(3);
  });

  it('空配列 → 空配列', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('formatShortDate', () => {
  it('「M/D」形式にする（トースト表示用）', () => {
    const ts = new Date(2026, 6, 3, 12, 0).getTime();
    expect(formatShortDate(ts)).toBe('7/3');
  });
});
