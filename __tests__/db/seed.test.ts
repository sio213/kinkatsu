// jest.mock はホイストされるため var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockValues: jest.Mock;
var mockWhere: jest.Mock;
var mockSet: jest.Mock;
var mockSelectResult: { id: number; slug: string | null; name: string; category: string; source: string }[];

jest.mock('@/db/client', () => {
  mockValues = jest.fn().mockResolvedValue(undefined);
  mockWhere = jest.fn().mockResolvedValue(undefined);
  mockSet = jest.fn().mockReturnValue({ where: () => mockWhere() });

  const mockFrom = jest.fn().mockReturnValue({
    where: jest.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
  });

  return {
    db: {
      select: jest.fn().mockReturnValue({ from: mockFrom }),
      insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockValues(...args) }),
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockSet(...args) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  exercises: { id: 'id', slug: 'slug', name: 'name', category: 'category', source: 'source' },
}));

jest.mock('drizzle-orm', () => ({ eq: jest.fn((col, val) => ({ col, val })) }));

import { seed } from '@/db/seed';

describe('seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectResult = [];
  });

  it('既存presetが0件 → 全56件insertし、updateは呼ばれない', async () => {
    await seed();
    expect(mockValues).toHaveBeenCalledTimes(1);
    const inserted = mockValues.mock.calls[0][0] as { slug: string; source: string }[];
    expect(inserted).toHaveLength(56);
    expect(inserted.every((e) => e.source === 'preset')).toBe(true);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('slugが一致しcategoryも一致 → その種目はinsert/updateどちらの対象にもならない', async () => {
    mockSelectResult = [
      { id: 1, slug: 'bench_press', name: 'ベンチプレス', category: 'chest', source: 'preset' },
    ];
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string }[];
    expect(inserted).toHaveLength(55);
    expect(inserted.some((e) => e.slug === 'bench_press')).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('slugが一致しcategoryが異なる → insert対象からは除外され、updateでcategoryのみ更新される', async () => {
    mockSelectResult = [
      { id: 1, slug: 'bench_press', name: 'ベンチプレス', category: 'other', source: 'preset' },
    ];
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string }[];
    expect(inserted.some((e) => e.slug === 'bench_press')).toBe(false);

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'chest' }),
    );
  });

  it('insert失敗時、例外を外に投げない（呼び出し元でクラッシュしない）', async () => {
    mockValues.mockRejectedValueOnce(new Error('insert failed'));
    await expect(seed()).resolves.toBeUndefined();
  });
});
