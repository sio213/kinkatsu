// jest.mock はホイストされるため var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockValues: jest.Mock;
var mockWhere: jest.Mock;
var mockSet: jest.Mock;
var mockSelectResult: {
  id: number;
  slug: string | null;
  name: string;
  category: string;
  source: string;
  measurementType: string;
  pairedWeights: boolean;
}[];

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
  exercises: {
    id: 'id',
    slug: 'slug',
    name: 'name',
    category: 'category',
    source: 'source',
    measurementType: 'measurementType',
    pairedWeights: 'pairedWeights',
  },
}));

jest.mock('drizzle-orm', () => ({ eq: jest.fn((col, val) => ({ col, val })) }));

import { seed, PRESET_EXERCISES } from '@/db/seed';

describe('seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectResult = [];
  });

  it('既存presetが0件 → 全件insertし、updateは呼ばれない', async () => {
    await seed();
    expect(mockValues).toHaveBeenCalledTimes(1);
    const inserted = mockValues.mock.calls[0][0] as { slug: string; source: string; measurementType: string }[];
    expect(inserted).toHaveLength(PRESET_EXERCISES.length);
    expect(inserted.every((e) => e.source === 'preset')).toBe(true);
    expect(inserted.every((e) => typeof e.measurementType === 'string' && e.measurementType.length > 0)).toBe(
      true,
    );
    const benchPress = inserted.find((e) => e.slug === 'bench_press');
    expect(benchPress?.measurementType).toBe('weight_reps');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('slugが一致しcategoryも一致 → その種目はinsert/updateどちらの対象にもならない', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'bench_press',
        name: 'ベンチプレス',
        category: 'chest',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
    ];
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string }[];
    expect(inserted).toHaveLength(PRESET_EXERCISES.length - 1);
    expect(inserted.some((e) => e.slug === 'bench_press')).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('slugが一致しcategoryが異なる → insert対象からは除外され、categoryの差分でupdateされる', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'bench_press',
        name: 'ベンチプレス',
        category: 'other',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
    ];
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string }[];
    expect(inserted.some((e) => e.slug === 'bench_press')).toBe(false);

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'chest' }),
    );
  });

  it('slugが一致しmeasurementTypeが異なる → measurementTypeの差分でupdateされる', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'bench_press',
        name: 'ベンチプレス',
        category: 'chest',
        source: 'preset',
        measurementType: 'reps',
        pairedWeights: false,
      },
    ];
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string }[];
    expect(inserted.some((e) => e.slug === 'bench_press')).toBe(false);

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'chest', measurementType: 'weight_reps' }),
    );
  });

  // 列の追加時にバックフィルのマイグレーションを書いていないため、既存ユーザーの
  // ダンベル種目をtrueにするのはこの差分検知だけが担う（db/schema.tsのpairedWeights参照）
  it('slugが一致しpairedWeightsが異なる → pairedWeightsの差分でupdateされる', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'dumbbell_bench_press',
        name: 'ダンベルベンチプレス',
        category: 'chest',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
    ];
    await seed();
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ pairedWeights: true }));
  });

  // 一度trueにした後、次回起動のたびにupdateが再発火しないこと。差分検知が
  // `?? false` の正規化を誤ると、毎回22件のUPDATEが走り続ける
  it('slugが一致しpairedWeightsも一致（true同士）→ updateされない', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'dumbbell_bench_press',
        name: 'ダンベルベンチプレス',
        category: 'chest',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: true,
      },
    ];
    await seed();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('PRESET_EXERCISESでpairedWeightsを省略した種目はfalseとしてinsertされる', async () => {
    await seed();
    const inserted = mockValues.mock.calls[0][0] as { slug: string; pairedWeights?: boolean }[];
    expect(inserted.find((e) => e.slug === 'dumbbell_bench_press')?.pairedWeights).toBe(true);
    // 1個を両手で持つ種目・ワンハンド系は付けない（付けると総重量が倍になってしまう）
    expect(inserted.find((e) => e.slug === 'dumbbell_pullover')?.pairedWeights).toBeUndefined();
    expect(inserted.find((e) => e.slug === 'dumbbell_one_arm_row')?.pairedWeights).toBeUndefined();
    expect(inserted.find((e) => e.slug === 'bench_press')?.pairedWeights).toBeUndefined();
  });

  it('複数種目がそれぞれ異なるフィールドで差分 → 各々のupdateが独立して発火する', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'bench_press',
        name: 'ベンチプレス',
        category: 'other',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
      {
        id: 2,
        slug: 'push_up',
        name: 'プッシュアップ',
        category: 'chest',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
    ];
    await seed();
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ category: 'chest' }));
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ measurementType: 'reps' }));
  });

  it('insert失敗時、例外を外に投げない（呼び出し元でクラッシュしない）', async () => {
    mockValues.mockRejectedValueOnce(new Error('insert failed'));
    await expect(seed()).resolves.toBeUndefined();
  });

  it('update失敗時、例外を外に投げない（呼び出し元でクラッシュしない）', async () => {
    mockSelectResult = [
      {
        id: 1,
        slug: 'bench_press',
        name: 'ベンチプレス',
        category: 'other',
        source: 'preset',
        measurementType: 'weight_reps',
        pairedWeights: false,
      },
    ];
    mockWhere.mockRejectedValueOnce(new Error('update failed'));
    await expect(seed()).resolves.toBeUndefined();
  });
});
