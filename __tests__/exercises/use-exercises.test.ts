// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockValues: jest.Mock;
var mockWhere: jest.Mock;
var mockSet: jest.Mock;
var mockData: unknown[] | undefined;

jest.mock('@/db/client', () => {
  mockValues = jest.fn().mockResolvedValue(undefined);
  mockWhere = jest.fn().mockResolvedValue(undefined);
  mockSet = jest.fn().mockReturnValue({ where: () => mockWhere() });

  const mockFrom = jest.fn().mockReturnValue({
    orderBy: jest.fn().mockReturnValue({}),
    where: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({}) }),
  });

  return {
    db: {
      select: jest.fn().mockReturnValue({ from: mockFrom }),
      insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockValues(...args) }),
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockSet(...args) }),
      delete: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockWhere(...args) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  exercises: { id: 'id', name: 'name', category: 'category', note: 'note', favorite: 'favorite' },
}));

jest.mock('drizzle-orm', () => ({ eq: jest.fn((col, val) => ({ col, val })) }));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: mockData })),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useExercises } from '@/hooks/use-exercises';

type HookResult = ReturnType<typeof useExercises>;
let captured: HookResult;

function Harness() {
  captured = useExercises();
  return null;
}

function mount() {
  act(() => { create(React.createElement(Harness)); });
  return captured;
}

beforeEach(() => {
  mockData = undefined;
  jest.clearAllMocks();
});

describe('useExercises', () => {
  describe('exercises', () => {
    it('data=undefined のとき []', () => {
      expect(mount().exercises).toEqual([]);
    });

    it('data=[...] のときそのまま返す', () => {
      const fake = [{ id: 1, name: 'テスト', category: '胸' }];
      mockData = fake;
      expect(mount().exercises).toBe(fake);
    });
  });

  describe('addExercise', () => {
    it('note 省略時 note: null', async () => {
      const { addExercise } = mount();
      await act(async () => { await addExercise('ベンチプレス', '胸'); });
      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
    });

    it('note 指定時その値が渡る', async () => {
      const { addExercise } = mount();
      await act(async () => { await addExercise('ベンチプレス', '胸', 'メモ'); });
      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ note: 'メモ' }));
    });

    it('source は常に "custom"', async () => {
      const { addExercise } = mount();
      await act(async () => { await addExercise('ベンチプレス', '胸'); });
      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ source: 'custom' }));
    });

    it('createdAt / updatedAt に数値が入る', async () => {
      const before = Date.now();
      const { addExercise } = mount();
      await act(async () => { await addExercise('ベンチプレス', '胸'); });
      const after = Date.now();
      const payload = (mockValues as jest.Mock).mock.calls[0][0];
      expect(payload.createdAt).toBeGreaterThanOrEqual(before);
      expect(payload.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('updateExercise', () => {
    it('updatedAt がマージされる', async () => {
      const before = Date.now();
      const { updateExercise } = mount();
      await act(async () => { await updateExercise(1, { name: '新しい名前' }); });
      const after = Date.now();
      const payload = (mockSet as jest.Mock).mock.calls[0][0];
      expect(payload.name).toBe('新しい名前');
      expect(payload.updatedAt).toBeGreaterThanOrEqual(before);
      expect(payload.updatedAt).toBeLessThanOrEqual(after);
    });

    it('指定フィールドのみ渡る（category は含まない）', async () => {
      const { updateExercise } = mount();
      await act(async () => { await updateExercise(1, { name: '新しい名前' }); });
      expect((mockSet as jest.Mock).mock.calls[0][0].category).toBeUndefined();
    });
  });

  describe('toggleFavorite', () => {
    it('favorite=true を SET する', async () => {
      const { toggleFavorite } = mount();
      await act(async () => { await toggleFavorite(1, true); });
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ favorite: true }));
    });

    it('favorite=false を SET する', async () => {
      const { toggleFavorite } = mount();
      await act(async () => { await toggleFavorite(1, false); });
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ favorite: false }));
    });
  });

  describe('removeExercise', () => {
    it('removeExercise が Promise を返す', async () => {
      const { removeExercise } = mount();
      await act(async () => {
        const result = removeExercise(99);
        expect(result).toBeInstanceOf(Promise);
        await result;
      });
    });
  });
});
