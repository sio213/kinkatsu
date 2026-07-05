import type { Exercise } from '@/db/schema';
import { filterExercises, normalizeForSearch } from '@/lib/exercises/filter';
import { CATEGORY_ALL, CATEGORY_FAVORITE } from '@/lib/exercises/constants';

function make(overrides: Partial<Exercise> & { name: string; category: string }): Exercise {
  return {
    id: 1, slug: null, favorite: false, note: null, muscle: null, formPoints: null, source: 'preset',
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

const CHEST  = make({ id: 1, name: 'ベンチプレス',   category: 'chest' });
const CHEST2 = make({ id: 2, name: 'ダンベルフライ', category: 'chest' });
const SHOULDER = make({ id: 3, name: 'サイドレイズ', category: 'shoulder' });
const FAV    = make({ id: 4, name: 'スクワット',     category: 'leg', favorite: true });
const UNKNOWN = make({ id: 5, name: 'テスト種目',    category: '未知カテゴリ' });

const ALL = [CHEST, CHEST2, SHOULDER, FAV, UNKNOWN];

const CUSTOM_ALNUM = make({ id: 6, name: 'EZバーカール', category: 'arm' });
const CUSTOM_PAREN = make({ id: 7, name: 'チェストプレス（マシン）', category: 'chest' });
const CUSTOM_CHOON = make({ id: 8, name: 'カーフレイズ', category: 'leg' });
const CUSTOM_KANJI = make({ id: 9, name: '縄跳び', category: 'cardio' });
const CUSTOM_HIRA  = make({ id: 10, name: 'なわとび', category: 'cardio' });

const EXT = [...ALL, CUSTOM_ALNUM, CUSTOM_PAREN, CUSTOM_CHOON, CUSTOM_KANJI, CUSTOM_HIRA];

// guides.ts に実データがある preset slug を使い、使う筋肉での検索を確認する
const HIP_THRUST = make({ id: 11, name: 'ヒップスラスト', category: 'glute', slug: 'hip_thrust', source: 'preset' });
const BICYCLE_CRUNCH = make({ id: 12, name: 'バイシクルクランチ', category: 'abs', slug: 'bicycle_crunch', source: 'preset' });
const MUSCLE_SET = [HIP_THRUST, BICYCLE_CRUNCH];

// aliases.ts に別名が登録されているpreset slugを使い、俗称検索を確認する
const PLANK = make({ id: 13, name: 'プランク', category: 'core', slug: 'plank', source: 'preset' });
const WALL_SIT = make({ id: 14, name: 'ウォールシット', category: 'leg', slug: 'wall_sit', source: 'preset' });
const CUSTOM_NO_SLUG = make({ id: 15, name: 'カスタム種目', category: 'other', source: 'custom' });
const SHRUG = make({ id: 16, name: 'シュラッグ', category: 'shoulder', slug: 'shrug', source: 'preset' });
const DUMBBELL_SHRUG = make({
  id: 17,
  name: 'ダンベルシュラッグ',
  category: 'shoulder',
  slug: 'dumbbell_shrug',
  source: 'preset',
});
const ALIAS_SET = [PLANK, WALL_SIT, CUSTOM_NO_SLUG, SHRUG, DUMBBELL_SHRUG];

// 略称エイリアスの検索確認用
const BENCH_PRESS = make({ id: 18, name: 'ベンチプレス', category: 'chest', slug: 'bench_press', source: 'preset' });
const BARBELL_SHOULDER_PRESS = make({
  id: 19,
  name: 'バーベルショルダープレス',
  category: 'shoulder',
  slug: 'barbell_shoulder_press',
  source: 'preset',
});
const SEATED_BARBELL_SHOULDER_PRESS = make({
  id: 20,
  name: 'シーテッドバーベルショルダープレス',
  category: 'shoulder',
  slug: 'seated_barbell_shoulder_press',
  source: 'preset',
});
const ABBREVIATION_SET = [BENCH_PRESS, BARBELL_SHOULDER_PRESS, SEATED_BARBELL_SHOULDER_PRESS];

describe('filterExercises', () => {
  it('空配列 → []', () => {
    expect(filterExercises([], CATEGORY_ALL, '')).toEqual([]);
  });

  describe('カテゴリフィルタ', () => {
    it('CATEGORY_ALL + search なし → 全件', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, '')).toHaveLength(ALL.length);
    });

    it('CATEGORY_FAVORITE → favorite=true のみ', () => {
      const result = filterExercises(ALL, CATEGORY_FAVORITE, '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(FAV.id);
    });

    it('CATEGORY_FAVORITE かつお気に入りなし → []', () => {
      expect(filterExercises([CHEST, CHEST2], CATEGORY_FAVORITE, '')).toEqual([]);
    });

    it('特定カテゴリ（chest）→ chestのみ', () => {
      const result = filterExercises(ALL, 'chest', '');
      expect(result.every((e) => e.category === 'chest')).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('存在しないカテゴリ → []', () => {
      expect(filterExercises(ALL, '存在しないカテゴリ', '')).toEqual([]);
    });
  });

  describe('テキスト検索', () => {
    it('部分一致で絞り込む', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'ベンチ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ベンチプレス');
    });

    it('空白のみ → フィルタなし（全件）', () => {
      expect(filterExercises([CHEST, CHEST2], CATEGORY_ALL, '   ')).toHaveLength(2);
    });

    it('前後空白つき → trim されてマッチ', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, ' ベンチ ');
      expect(result).toHaveLength(1);
    });

    it('マッチなし → []', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, 'zzz絶対マッチしない')).toEqual([]);
    });
  });

  describe('かな/カナ表記ゆれ吸収', () => {
    it('ひらがな検索でカタカナ種目名にマッチ（濁点・小書き含む）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'すくわっと');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('スクワット');
    });

    it('濁点つきひらがな', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'だんべる');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ダンベルフライ');
    });

    it('半角カナ検索でも全角カタカナ種目名にマッチ（NFKC正規化）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'ｽｸﾜｯﾄ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('スクワット');
    });

    it('normalizeForSearch はひらがな→カタカナ・NFKC・小文字化を行う', () => {
      expect(normalizeForSearch('すくわっと')).toBe('スクワット');
      expect(normalizeForSearch('ABC')).toBe('abc');
    });

    it('半角英字クエリは大文字小文字を区別せずマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ez').map((e) => e.name)).toContain('EZバーカール');
      expect(filterExercises(EXT, CATEGORY_ALL, 'EZ').map((e) => e.name)).toContain('EZバーカール');
    });

    it('全角英字クエリはNFKCで半角化されマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ＥＺ').map((e) => e.name)).toContain('EZバーカール');
    });

    it('全角括弧を含む種目名は括弧外の語で部分一致する', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'マシン').map((e) => e.name)).toContain(
        'チェストプレス（マシン）',
      );
    });

    it('半角括弧クエリでも全角括弧を含む種目名にマッチする（NFKC）', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, '(マシン)').map((e) => e.name)).toContain(
        'チェストプレス（マシン）',
      );
    });

    it('長音符を含む種目名にひらがなクエリでマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'かーふ').map((e) => e.name)).toContain(
        'カーフレイズ',
      );
    });

    it('カタカナクエリでひらがなを含む種目名にマッチする（逆方向）', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, 'ナワトビ').map((e) => e.name)).toContain(
        'なわとび',
      );
    });

    it('漢字のみのクエリで漢字名にマッチする', () => {
      expect(filterExercises(EXT, CATEGORY_ALL, '縄跳').map((e) => e.name)).toContain('縄跳び');
    });

    it('前後の全角スペースはtrimされてマッチする', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, '　ベンチ　')).toHaveLength(1);
    });

    it('normalizeForSearch は空文字・記号を安全に扱う', () => {
      expect(normalizeForSearch('')).toBe('');
      expect(normalizeForSearch('（）!?')).toBe('()!?');
      expect(() => normalizeForSearch('💪スクワット')).not.toThrow();
    });
  });

  describe('使う筋肉での検索', () => {
    it('漢字クエリでmuscleにマッチする', () => {
      expect(filterExercises(MUSCLE_SET, CATEGORY_ALL, '大臀筋').map((e) => e.name)).toContain(
        'ヒップスラスト',
      );
    });

    it('ひらがなクエリでもmuscleの読みにマッチする', () => {
      expect(filterExercises(MUSCLE_SET, CATEGORY_ALL, 'ふくしゃきん').map((e) => e.name)).toContain(
        'バイシクルクランチ',
      );
    });

    it('名前・muscleどちらにも該当しなければマッチしない', () => {
      expect(filterExercises(MUSCLE_SET, CATEGORY_ALL, '大胸筋')).toEqual([]);
    });

    it('guideを持たない種目（slugなし）はmuscle検索の対象にならずクラッシュしない', () => {
      expect(() => filterExercises([...MUSCLE_SET, CHEST], CATEGORY_ALL, '大臀筋')).not.toThrow();
    });
  });

  describe('カテゴリ名そのものでの検索', () => {
    it('カテゴリラベルで検索するとそのカテゴリの種目が全件ヒットする（「胸」→chestカテゴリ全部）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, '胸');
      expect(result.map((e) => e.name).sort()).toEqual(
        [CHEST.name, CHEST2.name].sort(),
      );
    });

    it('他カテゴリのラベルとは混同しない（「肩」→shoulderのみ）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, '肩');
      expect(result.map((e) => e.name)).toEqual([SHOULDER.name]);
    });

    it('カテゴリチップ絞り込みと併用すると、絞り込み後の集合内でのみカテゴリ名検索が効く', () => {
      // activeCategory=leg の中に「胸」カテゴリの種目は無いので該当なし
      const result = filterExercises(ALL, 'leg', '胸');
      expect(result).toEqual([]);
    });

    it('複数文字のカテゴリラベルは部分一致する（名前検索と同じ仕様。「筋」→腹筋カテゴリも含まれる）', () => {
      const abs = make({ id: 21, name: 'クランチマシン', category: 'abs' });
      const result = filterExercises([...ALL, abs], CATEGORY_ALL, '筋');
      expect(result.map((e) => e.name)).toContain('クランチマシン');
    });

    it('カテゴリ名検索とmuscle検索は独立してORで効く（「肩」→shoulderカテゴリ＋muscleに「肩」を含む他カテゴリの種目も両方ヒット）', () => {
      // ab_wheel_rolloutはcategory=abs、guide.muscleに「肩」を含む（既存のmuscle検索機能由来）。
      // カテゴリ名検索を追加してもこの挙動を壊さないことを確認する。
      const abWheelRollout = make({
        id: 22,
        name: 'アブローラー',
        category: 'abs',
        slug: 'ab_wheel_rollout',
        source: 'preset',
      });
      const result = filterExercises([...ALL, abWheelRollout], CATEGORY_ALL, '肩');
      expect(result.map((e) => e.name).sort()).toEqual([SHOULDER.name, 'アブローラー'].sort());
    });

    it('CATEGORY_LABELSに無い未知カテゴリは、カテゴリ文字列そのものでマッチする', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, '未知カテゴリ');
      expect(result.map((e) => e.name)).toContain(UNKNOWN.name);
    });
  });

  describe('別名（俗称）での検索', () => {
    it('カタカナ以外の俗称でマッチする（プランク→フロントブリッジ）', () => {
      const result = filterExercises(ALIAS_SET, CATEGORY_ALL, 'フロントブリッジ');
      expect(result.map((e) => e.name)).toContain('プランク');
    });

    it('ひらがな読みで漢字を含む俗称にマッチする（ウォールシット→空気椅子）', () => {
      const result = filterExercises(ALIAS_SET, CATEGORY_ALL, 'くうきいす');
      expect(result.map((e) => e.name)).toContain('ウォールシット');
    });

    it('slugを持たないcustom種目は俗称検索でクラッシュしない', () => {
      expect(() => filterExercises(ALIAS_SET, CATEGORY_ALL, 'フロントブリッジ')).not.toThrow();
    });

    it('器具違いで同じ俗称を共有する種目は両方ヒットする（肩すくめ→シュラッグ/ダンベルシュラッグ）', () => {
      const result = filterExercises(ALIAS_SET, CATEGORY_ALL, 'かたすくめ');
      expect(result.map((e) => e.name).sort()).toEqual(['シュラッグ', 'ダンベルシュラッグ'].sort());
    });

    it('英字略称でマッチする（BP→ベンチプレス）', () => {
      const result = filterExercises(ABBREVIATION_SET, CATEGORY_ALL, 'BP');
      expect(result.map((e) => e.name)).toContain('ベンチプレス');
    });

    it('英字略称は大文字小文字を区別しない（bp→ベンチプレス）', () => {
      const result = filterExercises(ABBREVIATION_SET, CATEGORY_ALL, 'bp');
      expect(result.map((e) => e.name)).toContain('ベンチプレス');
    });

    it('OHPは立位のバーベルショルダープレスのみにマッチし、座位バリエーションには誤爆しない', () => {
      const result = filterExercises(ABBREVIATION_SET, CATEGORY_ALL, 'OHP');
      expect(result.map((e) => e.name)).toEqual(['バーベルショルダープレス']);
    });
  });

  describe('あいまい検索（タイプミス許容フォールバック）', () => {
    it('完全一致が1件でもあればあいまい検索は発動しない（別種目が紛れ込まない）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'すくわっと');
      expect(result.map((e) => e.name)).toEqual(['スクワット']);
    });

    it('長音符抜けのタイプミスでもフォールバックでマッチする', () => {
      const result = filterExercises(EXT, CATEGORY_ALL, 'かふれいず');
      expect(result.map((e) => e.name)).toContain('カーフレイズ');
    });

    it('促音抜けのタイプミスでもフォールバックでマッチする', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'すくわと');
      expect(result.map((e) => e.name)).toContain('スクワット');
    });

    it('短すぎるクエリ（3文字以下）はあいまい検索の対象外', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, 'ばんち')).toEqual([]);
    });

    it('無関係な語には誤爆しない', () => {
      expect(filterExercises(ALL, CATEGORY_ALL, 'ぜんぜんちがうたんご')).toEqual([]);
    });
  });

  describe('カテゴリ + search の複合', () => {
    it('AND 条件で絞り込む', () => {
      const result = filterExercises(ALL, 'chest', 'ダンベル');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ダンベルフライ');
    });
  });

  describe('ソート', () => {
    it('CATEGORY_ORDER 昇順（chest < shoulder）', () => {
      const result = filterExercises([SHOULDER, CHEST], CATEGORY_ALL, '');
      expect(result[0].category).toBe('chest');
      expect(result[1].category).toBe('shoulder');
    });

    it('同カテゴリ内は名前の localeCompare("ja") 昇順', () => {
      const result = filterExercises([CHEST, CHEST2], CATEGORY_ALL, '');
      expect(result[0].name).toBe('ダンベルフライ');
      expect(result[1].name).toBe('ベンチプレス');
    });

    it('未知カテゴリは order=99 でソート末尾', () => {
      const result = filterExercises([UNKNOWN, CHEST], CATEGORY_ALL, '');
      expect(result[result.length - 1].category).toBe('未知カテゴリ');
    });
  });
});
