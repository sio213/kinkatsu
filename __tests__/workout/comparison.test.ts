import { compareToPrevious } from '@/lib/workout/comparison';
import type { SetLike } from '@/lib/workout/set-format';

function set(overrides: Partial<SetLike> = {}): SetLike {
  return { weight: null, reps: null, durationSeconds: null, distanceMeters: null, ...overrides };
}

describe('compareToPrevious', () => {
  describe('weight_reps', () => {
    it('重量が増えていれば主指標(weight)の増加として返す', () => {
      const current = [set({ weight: 62.5, reps: 8 })];
      const previous = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'weight',
        delta: 2.5,
        label: '+2.5kg',
      });
    });

    it('重量が減っていれば主指標(weight)の減少として返す', () => {
      const current = [set({ weight: 55, reps: 8 })];
      const previous = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'weight',
        delta: -5,
        label: '-5kg',
      });
    });

    it('重量が同じで回数が減っていれば副指標(reps)の変化として返す', () => {
      const current = [set({ weight: 60, reps: 8 })];
      const previous = [set({ weight: 60, reps: 10 })];
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'reps',
        delta: -2,
        label: '-2回',
      });
    });

    it('重量・回数とも同じなら比較結果なし(null)を返す', () => {
      const current = [set({ weight: 60, reps: 8 })];
      const previous = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, previous)).toBeNull();
    });

    it('前回記録が無ければnullを返す', () => {
      const current = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, [])).toBeNull();
    });

    it('今回が未入力(代表セットが決まらない)ならnullを返す', () => {
      const previous = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', [], previous)).toBeNull();
    });

    it('複数セットのうち代表セット（重量最大、同重量なら回数最大）同士で比較する', () => {
      const current = [set({ weight: 60, reps: 10 }), set({ weight: 62.5, reps: 6 })];
      const previous = [set({ weight: 60, reps: 8 }), set({ weight: 55, reps: 12 })];
      // 今回の代表: 62.5kg×6, 前回の代表: 60kg×8 → weight +2.5kg
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'weight',
        delta: 2.5,
        label: '+2.5kg',
      });
    });

    it('浮動小数点の誤差を丸めて表示する（62.5-60のような値が汚くならない）', () => {
      const current = [set({ weight: 60.1, reps: 8 })];
      const previous = [set({ weight: 60, reps: 8 })];
      const result = compareToPrevious('weight_reps', current, previous);
      expect(result?.label).toBe('+0.1kg');
    });

    it('丸めると0kgになる極小差分は「変化なし」としてnullを返す（+0kg表示のような矛盾を防ぐ）', () => {
      const current = [set({ weight: 60.001, reps: 8 })];
      const previous = [set({ weight: 60, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, previous)).toBeNull();
    });

    it('今回・前回とも複数セットで副指標のタイブレークが両側で効く', () => {
      // 今回の代表: 62.5kg×10(62.5kgのうち回数最大)、前回の代表: 60kg×12(60kgのうち回数最大)
      const current = [set({ weight: 62.5, reps: 6 }), set({ weight: 62.5, reps: 10 })];
      const previous = [set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 12 })];
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'weight',
        delta: 2.5,
        label: '+2.5kg',
      });
    });

    it('前回側は確定/未確定を区別しないSetLikeをそのまま比較対象にする（確定/未確定の絞り込みは呼び出し側の責務）', () => {
      // completedAtを持たないSetLikeなので、呼び出し側がプリフィルのみの値を除外せず渡せば
      // そのまま比較対象になる（呼び出し側で確定セットのみに絞ることが前提）
      const current = [set({ weight: 60, reps: 8 })];
      const previous = [set({ weight: 55, reps: 8 })];
      expect(compareToPrevious('weight_reps', current, previous)).toEqual({
        field: 'weight',
        delta: 5,
        label: '+5kg',
      });
    });
  });

  describe('reps', () => {
    it('回数のみの計測タイプでは回数の増減を主指標として返す', () => {
      const current = [set({ reps: 20 })];
      const previous = [set({ reps: 15 })];
      expect(compareToPrevious('reps', current, previous)).toEqual({ field: 'reps', delta: 5, label: '+5回' });
    });

    it('回数が同じなら変化なし(null)を返す', () => {
      const current = [set({ reps: 15 })];
      const previous = [set({ reps: 15 })];
      expect(compareToPrevious('reps', current, previous)).toBeNull();
    });
  });

  describe('time', () => {
    it('時間のみの計測タイプでは秒数の増減を主指標として返す', () => {
      const current = [set({ durationSeconds: 90 })];
      const previous = [set({ durationSeconds: 60 })];
      expect(compareToPrevious('time', current, previous)).toEqual({
        field: 'durationSeconds',
        delta: 30,
        label: '+30秒',
      });
    });

    it('時間が同じなら変化なし(null)を返す', () => {
      const current = [set({ durationSeconds: 60 })];
      const previous = [set({ durationSeconds: 60 })];
      expect(compareToPrevious('time', current, previous)).toBeNull();
    });
  });

  describe('distance_time', () => {
    it('距離をkm換算して増減を返す', () => {
      const current = [set({ distanceMeters: 5500 })];
      const previous = [set({ distanceMeters: 5000 })];
      expect(compareToPrevious('distance_time', current, previous)).toEqual({
        field: 'distanceMeters',
        delta: 0.5,
        label: '+0.5km',
      });
    });

    it('距離が同じなら変化なし(null)を返す', () => {
      const current = [set({ distanceMeters: 5000 })];
      const previous = [set({ distanceMeters: 5000 })];
      expect(compareToPrevious('distance_time', current, previous)).toBeNull();
    });
  });

  describe('weight_time', () => {
    it('重量が同じで時間が伸びていれば副指標(durationSeconds)の変化として返す', () => {
      const current = [set({ weight: 20, durationSeconds: 45 })];
      const previous = [set({ weight: 20, durationSeconds: 30 })];
      expect(compareToPrevious('weight_time', current, previous)).toEqual({
        field: 'durationSeconds',
        delta: 15,
        label: '+15秒',
      });
    });
  });
});
