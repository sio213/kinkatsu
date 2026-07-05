import {
  formatSessionDateGroup,
  formatSessionDuration,
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
