import { Colors } from '@/constants/theme';
import { EXERCISE_CATEGORIES } from '@/lib/exercises/constants';
import {
  CALENDAR_COLOR_GROUP_COLORS,
  CALENDAR_COLOR_GROUPS,
  CALENDAR_COLOR_LEGEND,
  getCalendarCategoryColor,
  getCalendarColorGroup,
} from '@/lib/calendar/category-color';

describe('getCalendarColorGroup', () => {
  it.each([
    ['chest', 'chest'],
    ['back', 'back'],
    ['shoulder', 'shoulder'],
    ['arm', 'arm'],
    ['leg', 'legGlute'],
    ['glute', 'legGlute'],
    ['core', 'absCore'],
    ['abs', 'absCore'],
    ['cardio', 'cardioOther'],
    ['other', 'cardioOther'],
  ] as const)('%s は %s グループにマップされる', (category, expected) => {
    expect(getCalendarColorGroup(category)).toBe(expected);
  });

  it('EXERCISE_CATEGORIESの10種すべてが上の対応表でテストされている（追加時のメンテ漏れ検知）', () => {
    expect(EXERCISE_CATEGORIES).toHaveLength(10);
  });

  it('未知のカテゴリ文字列はcardioOther(グレー)にフォールバックする', () => {
    expect(getCalendarColorGroup('legacy_category')).toBe('cardioOther');
    expect(getCalendarColorGroup('')).toBe('cardioOther');
  });

  it.each(['Leg', 'LEG', 'Glute', ' leg', 'leg '])(
    '大文字小文字・前後空白混在(%s)は正規化されず未知カテゴリとしてcardioOtherにフォールバックする',
    (input) => {
      expect(getCalendarColorGroup(input)).toBe('cardioOther');
    },
  );

  it('null/undefined相当の入力でも例外を投げずcardioOtherにフォールバックする', () => {
    expect(getCalendarColorGroup(null as unknown as string)).toBe('cardioOther');
    expect(getCalendarColorGroup(undefined as unknown as string)).toBe('cardioOther');
  });

  it('EXERCISE_CATEGORIESの10種すべてが7グループのいずれかにマップされる', () => {
    for (const cat of EXERCISE_CATEGORIES) {
      expect(CALENDAR_COLOR_GROUPS).toContain(getCalendarColorGroup(cat));
    }
  });
});

describe('CALENDAR_COLOR_GROUP_COLORS', () => {
  it.each([
    ['chest', '#EF4444'],
    ['back', '#9333EA'],
    ['legGlute', '#0D9488'],
    ['absCore', '#16A34A'],
    ['shoulder', '#F59E0B'],
    ['arm', '#EC4899'],
    ['cardioOther', '#94A3B8'],
  ] as const)('%s の色は %s である', (group, hex) => {
    expect(CALENDAR_COLOR_GROUP_COLORS[group]).toBe(hex);
  });

  it('7グループの色はすべて異なる（判別しやすさの前提が壊れていないか）', () => {
    const values = CALENDAR_COLOR_GROUPS.map((g) => CALENDAR_COLOR_GROUP_COLORS[g]);
    expect(new Set(values).size).toBe(values.length);
  });

  it.each(CALENDAR_COLOR_GROUPS)(
    '%s の色はColors.accent(選択中/操作可能を示す色)と衝突しない',
    (group) => {
      expect(CALENDAR_COLOR_GROUP_COLORS[group]).not.toBe(Colors.accent);
    },
  );
});

describe('getCalendarCategoryColor', () => {
  it('#RRGGBB形式のhexカラーを返す', () => {
    for (const category of EXERCISE_CATEGORIES) {
      expect(getCalendarCategoryColor(category)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('未知カテゴリでも例外を投げない', () => {
    expect(() => getCalendarCategoryColor(null as unknown as string)).not.toThrow();
  });
});

describe('CALENDAR_COLOR_LEGEND', () => {
  it('7グループ分の凡例エントリを、デザイン案通りの表示順で持つ', () => {
    expect(CALENDAR_COLOR_LEGEND).toHaveLength(7);
    expect(CALENDAR_COLOR_LEGEND.map((e) => e.group)).toEqual([...CALENDAR_COLOR_GROUPS]);
  });

  it('各エントリがlabel/colorを持つ', () => {
    for (const entry of CALENDAR_COLOR_LEGEND) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
