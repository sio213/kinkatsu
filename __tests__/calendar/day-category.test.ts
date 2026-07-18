import { aggregateDailyPrimaryCategory, type DailyCategoryRow } from '@/lib/calendar/day-category';

describe('aggregateDailyPrimaryCategory', () => {
  it('1日1カテゴリのみなら、そのカテゴリが代表になる', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
    ];
    expect(aggregateDailyPrimaryCategory(rows)).toEqual(new Map([['2026-07-16', 'chest']]));
  });

  it('セット数が最も多いカテゴリが代表になる', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' },
    ];
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('leg');
  });

  it('セット数が同数の場合は先にやった種目のカテゴリが代表になる', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'back' }, // 最初にやった
      { dateKey: '2026-07-16', category: 'back' },
      { dateKey: '2026-07-16', category: 'back' },
      { dateKey: '2026-07-16', category: 'arm' }, // 後からやった、セット数は同じ3
      { dateKey: '2026-07-16', category: 'arm' },
      { dateKey: '2026-07-16', category: 'arm' },
    ];
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('back');
  });

  it('3カテゴリでのタイブレーク: 最初のカテゴリより後の2カテゴリが同数タイの場合も先にやった方が優先される', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' }, // 最初にやったが2セットのみ
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'back' }, // 2番目にやった、3セット
      { dateKey: '2026-07-16', category: 'back' },
      { dateKey: '2026-07-16', category: 'back' },
      { dateKey: '2026-07-16', category: 'arm' }, // 3番目にやった、backと同数3セット
      { dateKey: '2026-07-16', category: 'arm' },
      { dateKey: '2026-07-16', category: 'arm' },
    ];
    // 最多セット数(3)はback/armタイ。先にやったのはbackなのでbackが優先される
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('back');
  });

  it('複数セッション(複数日)が混在していても日付ごとに独立して集計される', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-17', category: 'leg' },
      { dateKey: '2026-07-17', category: 'leg' },
      { dateKey: '2026-07-17', category: 'back' },
    ];
    expect(aggregateDailyPrimaryCategory(rows)).toEqual(
      new Map([
        ['2026-07-16', 'chest'],
        ['2026-07-17', 'leg'],
      ]),
    );
  });

  it('1日に複数セッションがあっても、日をまたいで合算したセット数で代表カテゴリを決める', () => {
    // 同日に朝(chest 2セット)・夜(leg 2セット, arm 1セット)の2セッションがあったケース
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'arm' },
    ];
    // chest:2, leg:2, arm:1 → chest/legタイ、先にやったchestが優先される
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('chest');
  });

  it('空配列なら空のMapを返す', () => {
    expect(aggregateDailyPrimaryCategory([])).toEqual(new Map());
  });

  it('1セットのみの日はそのカテゴリが代表になる', () => {
    const rows: DailyCategoryRow[] = [{ dateKey: '2026-07-16', category: 'shoulder' }];
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('shoulder');
  });

  it('同じカテゴリが日内で非連続に出現しても合算される（複数セッションに分割された場合）', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' }, // 朝セッション
      { dateKey: '2026-07-16', category: 'leg' }, // 昼セッション
      { dateKey: '2026-07-16', category: 'chest' }, // 夜セッション、chestに戻る
    ];
    // chest:2(非連続合算), leg:1 → chestが代表
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('chest');
  });

  it('rowsが日付昇順でなくても日付ごとに独立して正しく集計される', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-17', category: 'leg' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-17', category: 'leg' },
      { dateKey: '2026-07-16', category: 'chest' },
      { dateKey: '2026-07-16', category: 'chest' },
    ];
    expect(aggregateDailyPrimaryCategory(rows)).toEqual(
      new Map([
        ['2026-07-17', 'leg'],
        ['2026-07-16', 'chest'],
      ]),
    );
  });

  it('4カテゴリで暫定1位が2回更新される（多段更新の網羅）', () => {
    const rows: DailyCategoryRow[] = [
      { dateKey: '2026-07-16', category: 'chest' }, // 最初、1セット
      { dateKey: '2026-07-16', category: 'back' },
      { dateKey: '2026-07-16', category: 'back' }, // 2セット
      { dateKey: '2026-07-16', category: 'arm' },
      { dateKey: '2026-07-16', category: 'arm' },
      { dateKey: '2026-07-16', category: 'arm' }, // 3セット
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' },
      { dateKey: '2026-07-16', category: 'leg' }, // 4セット、最多
    ];
    expect(aggregateDailyPrimaryCategory(rows).get('2026-07-16')).toBe('leg');
  });
});
