import type { Exercise } from '@/db/schema';
import { getGuide } from '@/lib/exercises/guides';

function make(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1, name: 'ベンチプレス', slug: 'bench_press', category: '胸',
    favorite: false, note: null, muscle: null, formPoints: null, source: 'preset',
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

describe('getGuide', () => {
  it('source が custom → undefined', () => {
    expect(getGuide(make({ source: 'custom' }))).toBeUndefined();
  });

  it('存在しないslug → undefined', () => {
    expect(getGuide(make({ slug: 'nonexistent_exercise' }))).toBeUndefined();
  });

  it('slugがnull → undefined', () => {
    expect(getGuide(make({ slug: null }))).toBeUndefined();
  });

  it('ベンチプレス → ガイドを返す', () => {
    expect(getGuide(make({ slug: 'bench_press' }))).toBeDefined();
  });

  it('返却ガイドが muscle / points / caution / breath を持つ', () => {
    const guide = getGuide(make({ slug: 'bench_press' }))!;
    expect(typeof guide.muscle).toBe('string');
    expect(Array.isArray(guide.points)).toBe(true);
    expect(guide.points.length).toBeGreaterThan(0);
    expect(typeof guide.caution).toBe('string');
    expect(typeof guide.breath).toBe('string');
  });

  it('スクワット → 大腿四頭筋を含む', () => {
    const guide = getGuide(make({ slug: 'squat', name: 'スクワット', category: '脚' }))!;
    expect(guide.muscle).toContain('大腿四頭筋');
  });
});
