// db/seed.ts は @/db/client を副作用ありでimportするため、実DBに触れないようモックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({ exercises: {} }));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));

import { existsSync } from 'fs';
import { join } from 'path';
import type { Exercise } from '@/db/schema';
import { PRESET_EXERCISES } from '@/db/seed';
import { getGuide } from '@/lib/exercises/guides';
import { getExerciseImages } from '@/lib/exercises/images';

// 2026-08-01 に全309種目を監査した結果を固定するテスト。プリセット種目の追加は
// 「seed.ts に1行足す」だけでは完結せず、guides・images・素材ファイルが揃って初めて
// 成立する（CLAUDE.md「プリセット種目を新規追加するとき」参照）。片方だけ足した状態を
// CIで検知するのがこのファイルの役割。

type Preset = (typeof PRESET_EXERCISES)[number];

function toExercise(preset: Preset, id: number): Exercise {
  return {
    id,
    slug: preset.slug,
    name: preset.name,
    category: preset.category,
    favorite: false,
    note: null,
    formPoints: null,
    source: 'preset',
    measurementType: preset.measurementType,
    pairedWeights: preset.pairedWeights ?? false,
    createdAt: 0,
    updatedAt: 0,
  };
}

const MEDIA_DIR = join(__dirname, '../../assets/exercise-media');
const exerciseOf = new Map(PRESET_EXERCISES.map((p, i) => [p.slug, toExercise(p, i + 1)]));

describe('プリセット種目マスタの整合性', () => {
  it('種目名に重複が無い', () => {
    const names = PRESET_EXERCISES.map((p) => p.name);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dup).toEqual([]);
  });

  it('全種目に動画とサムネイルが登録されている', () => {
    const missing = PRESET_EXERCISES.filter((p) => {
      const images = getExerciseImages(exerciseOf.get(p.slug)!);
      return images.source == null || images.thumbnail == null;
    }).map((p) => p.slug);
    expect(missing).toEqual([]);
  });

  it('登録されている素材ファイルが実在する（<slug>.mp4 と <slug>_thumb.png）', () => {
    const missing: string[] = [];
    for (const preset of PRESET_EXERCISES) {
      if (!existsSync(join(MEDIA_DIR, `${preset.slug}.mp4`))) missing.push(`${preset.slug}.mp4`);
      if (!existsSync(join(MEDIA_DIR, `${preset.slug}_thumb.png`))) {
        missing.push(`${preset.slug}_thumb.png`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('slug が weighted_ で始まるなら種目名に「加重」を含む', () => {
    const mismatched = PRESET_EXERCISES.filter(
      (p) => p.slug.startsWith('weighted_') && !p.name.includes('加重'),
    ).map((p) => p.slug);
    expect(mismatched).toEqual([]);
  });

  // pairedWeights の判定基準は db/seed.ts の PresetExercise 型のコメントに (a)(b) として
  // 明文化されている。そのうち機械的に判定できる (b) の反例をガードする——片手・片脚で
  // 動く種目は器具を1つしか扱わないため、総重量を2倍にしてはいけない
  it('片側ずつ動かす種目に pairedWeights が付いていない', () => {
    const singleSide = /シングルアーム|ワンハンド|片手|片腕|シングルレッグ|片脚/;
    const violations = PRESET_EXERCISES.filter(
      (p) => p.pairedWeights && singleSide.test(p.name),
    ).map((p) => p.slug);
    expect(violations).toEqual([]);
  });
});

describe('種目ガイド（guides）の品質', () => {
  it('全種目のガイドが、フォームのポイントを3項目以上持つ', () => {
    const thin = PRESET_EXERCISES.filter((p) => {
      const guide = getGuide(exerciseOf.get(p.slug)!);
      return guide != null && guide.points.length < 3;
    }).map((p) => p.slug);
    expect(thin).toEqual([]);
  });

  it('muscle / caution / breath がいずれも空でない', () => {
    const empty = PRESET_EXERCISES.filter((p) => {
      const guide = getGuide(exerciseOf.get(p.slug)!);
      if (guide == null) return false;
      return !guide.muscle.trim() || !guide.caution.trim() || !guide.breath.trim();
    }).map((p) => p.slug);
    expect(empty).toEqual([]);
  });

  // 「大腿四頭筋（特に）」のような書きかけの表記が1件混入していた（2026-08-01 修正）。
  // muscle は検索インデックスにも使われるため、空括弧や区切り文字の余りを弾く
  it('muscle に空括弧や区切り文字の余りが無い', () => {
    const malformed = PRESET_EXERCISES.filter((p) => {
      const guide = getGuide(exerciseOf.get(p.slug)!);
      if (guide == null) return false;
      return /（\s*）|\(\s*\)|（特に）|・・|^・|・$/.test(guide.muscle);
    }).map((p) => p.slug);
    expect(malformed).toEqual([]);
  });
});
