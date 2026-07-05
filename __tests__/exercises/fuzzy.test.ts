import { levenshteinDistance, fuzzyThreshold, isFuzzyMatch } from '@/lib/exercises/fuzzy';

describe('levenshteinDistance', () => {
  it('同じ文字列 → 0', () => {
    expect(levenshteinDistance('スクワット', 'スクワット')).toBe(0);
  });

  it('片方が空文字 → もう片方の長さ', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('1文字挿入・削除・置換をそれぞれ1とカウントする', () => {
    expect(levenshteinDistance('カフレイズ', 'カーフレイズ')).toBe(1); // 挿入
    expect(levenshteinDistance('カーフレイズ', 'カフレイズ')).toBe(1); // 削除
    expect(levenshteinDistance('スクワト', 'スクワット')).toBe(1); // 挿入（促音抜け）
  });
});

describe('fuzzyThreshold', () => {
  it('3文字以下は許容しない（0）', () => {
    expect(fuzzyThreshold(1)).toBe(0);
    expect(fuzzyThreshold(3)).toBe(0);
  });

  it('4〜7文字は1文字まで許容', () => {
    expect(fuzzyThreshold(4)).toBe(1);
    expect(fuzzyThreshold(7)).toBe(1);
  });

  it('8文字以上は2文字まで許容', () => {
    expect(fuzzyThreshold(8)).toBe(2);
    expect(fuzzyThreshold(20)).toBe(2);
  });
});

describe('isFuzzyMatch', () => {
  it('長音符抜けのタイプミスにマッチする', () => {
    expect(isFuzzyMatch('カフレイズ', 'カーフレイズ')).toBe(true);
  });

  it('促音抜けのタイプミスにマッチする', () => {
    expect(isFuzzyMatch('スクワト', 'スクワット')).toBe(true);
  });

  it('短すぎるクエリ（閾値0）は完全一致でなければマッチしない', () => {
    expect(isFuzzyMatch('ばんち', 'ベンチプレス')).toBe(false);
    expect(isFuzzyMatch('abc', 'abd')).toBe(false);
  });

  it('長さの差が閾値を超えるものはマッチしない（無関係な語への誤爆防止）', () => {
    expect(isFuzzyMatch('ぜんぜんちがうたんご', 'ベンチプレス')).toBe(false);
  });

  it('完全に無関係な語にはマッチしない', () => {
    expect(isFuzzyMatch('ブルガリアンスプリットスクワット', 'ダンベルカール')).toBe(false);
  });
});
