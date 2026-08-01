// db/seed.ts は @/db/client を副作用ありでimportするため、実DBに触れないようモックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({ exercises: {} }));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));

import type { Exercise } from '@/db/schema';
import { PRESET_EXERCISES } from '@/db/seed';
import { filterExercises } from '@/lib/exercises/filter';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { getReading } from '@/lib/exercises/readings';
import { getAliases } from '@/lib/exercises/aliases';
import { getGuide } from '@/lib/exercises/guides';
import { getMuscleReadingText } from '@/lib/exercises/muscle-readings';

function toExercise(preset: (typeof PRESET_EXERCISES)[number], id: number): Exercise {
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

describe('実データ（PRESET_EXERCISES）との整合性', () => {
  it('slugに重複が無い', () => {
    const slugs = PRESET_EXERCISES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('全種目が、自分自身の完全な種目名で検索すると必ず自分自身がヒットする（自己参照）', () => {
    const all = PRESET_EXERCISES.map(toExercise);
    const missing: string[] = [];
    for (const preset of PRESET_EXERCISES) {
      const result = filterExercises(all, CATEGORY_ALL, preset.name);
      if (!result.some((e) => e.slug === preset.slug)) {
        missing.push(preset.name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('全300件規模のリストに対してfilterExercisesを実行してもクラッシュしない（カテゴリ名・muscle・略称等あらゆる検索軸）', () => {
    const all = PRESET_EXERCISES.map(toExercise);
    const queries = ['胸', 'むね', '筋', 'BP', 'SQ', 'DL', 'OHP', '大臀筋', 'すくわっと', ''];
    for (const q of queries) {
      expect(() => filterExercises(all, CATEGORY_ALL, q)).not.toThrow();
    }
  });
});

// 2026-08-01 の全種目網羅調査で、下記はいずれも欠損ゼロであることを確認した。
// 新しい種目を追加したときに片方だけ登録して検索から漏れるのを防ぐため、その状態を固定する。
// 落ちた場合、エラーメッセージに出た種目に対応するデータを CLAUDE.md「プリセット種目を
// 新規追加するとき」の手順どおり追加すること。
describe('検索到達性（全種目がどの入力経路からでも引ける）', () => {
  const ALL = PRESET_EXERCISES.map(toExercise);
  // 漢字（CJK統合漢字）と踊り字「々」。カタカナ・ひらがなは normalizeForSearch が吸収するため対象外
  const KANJI = /[々一-鿿]/;

  function found(query: string, slug: string): boolean {
    return filterExercises(ALL, CATEGORY_ALL, query).some((e) => e.slug === slug);
  }

  function muscleWordsOf(guideMuscle: string): string[] {
    // getMuscleReadingText と同じ区切りで分割する
    return guideMuscle
      .split(/[・（）()、,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  it('種目名に漢字を含むなら READINGS に読み仮名がある（ひらがな入力で引けなくなるため）', () => {
    const missing = ALL.filter((e) => KANJI.test(e.name) && getReading(e) == null).map((e) => e.slug);
    expect(missing).toEqual([]);
  });

  it('登録済みの読み仮名で検索すると自分自身がヒットする', () => {
    const broken = ALL.filter((e) => {
      const reading = getReading(e);
      return reading != null && !found(reading, e.slug!);
    }).map((e) => e.slug);
    expect(broken).toEqual([]);
  });

  it('種目名をひらがなで打っても自分自身がヒットする', () => {
    const toHiragana = (s: string) =>
      s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    const broken = ALL.filter((e) => {
      const hira = toHiragana(e.name);
      return hira !== e.name && !found(hira, e.slug!);
    }).map((e) => e.slug);
    expect(broken).toEqual([]);
  });

  it('別名に漢字を含むなら読み仮名がある / 全ての別名で自分自身がヒットする', () => {
    const missingReading: string[] = [];
    const notFound: string[] = [];
    for (const e of ALL) {
      for (const alias of getAliases(e)) {
        if (KANJI.test(alias.text) && alias.reading == null) {
          missingReading.push(`${e.slug}:${alias.text}`);
        }
        if (!found(alias.text, e.slug!)) notFound.push(`${e.slug}:${alias.text}`);
        if (alias.reading != null && !found(alias.reading, e.slug!)) {
          notFound.push(`${e.slug}:${alias.reading}`);
        }
      }
    }
    expect(missingReading).toEqual([]);
    expect(notFound).toEqual([]);
  });

  it('全種目に GUIDES がある（使う筋肉からの検索と種目詳細の解説がどちらも成立しなくなるため）', () => {
    const missing = ALL.filter((e) => getGuide(e) == null).map((e) => e.slug);
    expect(missing).toEqual([]);
  });

  it('guides の muscle に含まれる漢字語はすべて MUSCLE_READINGS にある（ひらがなで筋肉名を打てなくなるため）', () => {
    const missing = new Set<string>();
    for (const e of ALL) {
      const guide = getGuide(e);
      if (guide == null) continue;
      for (const word of muscleWordsOf(guide.muscle)) {
        if (KANJI.test(word) && getMuscleReadingText(word) === '') missing.add(word);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
