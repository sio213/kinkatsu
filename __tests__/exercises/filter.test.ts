import type { Exercise } from '@/db/schema';
import {
  __getSearchIndexCacheSizeForTests,
  __resetSearchIndexCacheForTests,
  filterExercises,
  normalizeForSearch,
} from '@/lib/exercises/filter';
import { CATEGORY_ALL, CATEGORY_FAVORITE } from '@/lib/exercises/constants';

function make(overrides: Partial<Exercise> & { name: string; category: string }): Exercise {
  return {
    id: 1, slug: null, favorite: false, note: null, formPoints: null, source: 'preset',
    measurementType: 'weight_reps',
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

// 検索インデックスは id+updatedAt をキーにキャッシュされるため、テスト間でidを使い回した際に
// 別テストの結果が混入しないよう毎回クリアする
beforeEach(() => {
  __resetSearchIndexCacheForTests();
});

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

  describe('スペース区切りのAND検索', () => {
    const BULGARIAN = make({
      id: 23,
      name: 'ブルガリアンスプリットスクワット',
      category: 'leg',
    });
    const SET = [BULGARIAN, CHEST];

    it('スペース区切りの各語がすべて名前に含まれれば一致する', () => {
      const result = filterExercises(SET, CATEGORY_ALL, 'ブルガリアン スクワット');
      expect(result.map((e) => e.name)).toEqual([BULGARIAN.name]);
    });

    it('語順を入れ替えても一致する（語順非依存）', () => {
      const result = filterExercises(SET, CATEGORY_ALL, 'スクワット ブルガリアン');
      expect(result.map((e) => e.name)).toEqual([BULGARIAN.name]);
    });

    it('全角スペース区切りでも一致する', () => {
      const result = filterExercises(SET, CATEGORY_ALL, 'ブルガリアン　スクワット');
      expect(result.map((e) => e.name)).toEqual([BULGARIAN.name]);
    });

    it('一部の語だけでも一致しない語があればAND不成立で除外される', () => {
      const result = filterExercises(SET, CATEGORY_ALL, 'ブルガリアン ベンチプレス');
      expect(result).toEqual([]);
    });

    it('語ごとに別々のテキストにマッチしてもAND成立する（名前 + カテゴリ名の組み合わせ）', () => {
      // BULGARIANはcategory=leg（ラベル「脚」）。「ブルガリアン」は名前、「脚」はカテゴリラベルにマッチする
      const result = filterExercises(SET, CATEGORY_ALL, 'ブルガリアン 脚');
      expect(result.map((e) => e.name)).toEqual([BULGARIAN.name]);
    });

    it('前後・語間の余分な空白は無視される', () => {
      const result = filterExercises(SET, CATEGORY_ALL, '  ブルガリアン   スクワット  ');
      expect(result.map((e) => e.name)).toEqual([BULGARIAN.name]);
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

    it('ひらがな読みでもカテゴリ名にマッチする（「かた」→肩カテゴリ）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'かた');
      expect(result.map((e) => e.name)).toEqual([SHOULDER.name]);
    });

    it('ひらがな読みでもカテゴリ名にマッチする（「むね」→胸カテゴリ）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'むね');
      expect(result.map((e) => e.name).sort()).toEqual([CHEST.name, CHEST2.name].sort());
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

  describe('検索語ありのときの関連度順ソート', () => {
    // 「肩」を検索語にし、名前との一致の強さが異なる4件を用意する。
    // RELEVANCE_* はいずれも category を shoulder 以外にして、カテゴリラベル一致で
    // 誤ってヒットしないようにする（category label一致はSHOULDERフィクスチャ側で確認する）。
    const RELEVANCE_EXACT = make({ id: 60, name: '肩', category: 'other' });
    const RELEVANCE_PREFIX = make({ id: 61, name: '肩甲骨引き寄せ', category: 'other' });
    const RELEVANCE_SUBSTRING = make({ id: 62, name: 'ダンベル肩トレーニング', category: 'other' });
    // SHOULDER（'サイドレイズ'、category: shoulder）は名前に「肩」を含まず、
    // カテゴリラベル「肩」でのみ一致する＝最下位（その他）想定
    const RELEVANCE_SET = [RELEVANCE_SUBSTRING, SHOULDER, RELEVANCE_PREFIX, RELEVANCE_EXACT];

    it('完全一致 > 前方一致 > 部分一致 > その他（別名・カテゴリ等のみ一致）の順で並ぶ', () => {
      const result = filterExercises(RELEVANCE_SET, CATEGORY_ALL, '肩');
      expect(result.map((e) => e.name)).toEqual([
        RELEVANCE_EXACT.name,
        RELEVANCE_PREFIX.name,
        RELEVANCE_SUBSTRING.name,
        SHOULDER.name,
      ]);
    });

    it('ひらがな検索でもnormalizeForSearchによるかな正規化を介して名前と関連度比較される', () => {
      // 種目名はいずれもカタカナ。検索語をひらがなで入力しても、normalizeForSearchで
      // カタカナ化されてから比較されるため、完全一致・前方一致・部分一致の順位判定が機能する。
      const exact = make({ id: 63, name: 'スクワット', category: 'other' });
      const prefix = make({ id: 64, name: 'スクワットジャンプ', category: 'other' });
      const substring = make({ id: 65, name: 'ブルガリアンスプリットスクワット', category: 'other' });
      const result = filterExercises([substring, prefix, exact], CATEGORY_ALL, 'すくわっと');
      expect(result.map((e) => e.name)).toEqual([exact.name, prefix.name, substring.name]);
    });

    it('同じ関連度ランク内では（検索語ありでも）カテゴリ順→名前順でタイブレークされる', () => {
      // SHOULDER（サイドレイズ、category: shoulder）はカテゴリラベル「肩」でのみ一致し、
      // アブローラー（category: abs）はguide.muscleに「肩」を含むことでのみ一致する。
      // どちらも名前自体には「肩」を含まないため同ランク（3=その他）になり、
      // CATEGORY_ORDER（shoulder=1 < abs=5）でタイブレークされるはず
      const abWheelRollout = make({
        id: 66,
        name: 'アブローラー',
        category: 'abs',
        slug: 'ab_wheel_rollout',
        source: 'preset',
      });
      const result = filterExercises([abWheelRollout, SHOULDER], CATEGORY_ALL, '肩');
      expect(result.map((e) => e.name)).toEqual([SHOULDER.name, abWheelRollout.name]);
    });

    it('全角/半角・大文字小文字の違いを吸収して名前一致の関連度ランクが判定される', () => {
      const exact = make({ id: 67, name: 'EZ', category: 'other' });
      const prefix = make({ id: 68, name: 'EZバーカール', category: 'other' });
      const substring = make({ id: 69, name: 'ダンベルEZバー', category: 'other' });
      // 全角クエリ「ＥＺ」はnormalizeForSearchのNFKC正規化で半角小文字'ez'に変換されて比較される
      const result = filterExercises([substring, prefix, exact], CATEGORY_ALL, 'ＥＺ');
      expect(result.map((e) => e.name)).toEqual([exact.name, prefix.name, substring.name]);
    });

    it('別名（俗称）と完全一致しても、名前ベースの関連度ランクでは別名一致は最下位（その他）扱いになる', () => {
      // BENCH_PRESSは別名'BP'を持つが、名前自体（'ベンチプレス'）は'bp'を含まないためrank3。
      // 名前に'bp'を含む種目があれば、そちらが部分一致(rank2)として優先されるべき
      const bpInName = make({ id: 71, name: 'ダンベルBPトレーニング', category: 'other' });
      const result = filterExercises([BENCH_PRESS, bpInName], CATEGORY_ALL, 'BP');
      expect(result.map((e) => e.name)).toEqual([bpInName.name, BENCH_PRESS.name]);
    });

    it('スペース区切り複数トークン検索では関連度ランクが一律その他扱いになり、カテゴリ順→名前順にフォールバックする（仕様として許容）', () => {
      // nameMatchRankは検索語全体（スペース込み）と名前を比較するため、複数語クエリでは
      // 名前自体にスペースが含まれない限り完全一致・前方一致・部分一致のいずれにも該当しない。
      // AND検索自体はトークン単位で判定されるため結果集合には両方とも含まれる。
      const bulgarianA = make({ id: 72, name: 'ブルガリアンスプリットスクワット', category: 'leg' });
      const bulgarianB = make({ id: 73, name: 'ブルガリアンランジ', category: 'leg' });
      const result = filterExercises([bulgarianA, bulgarianB], CATEGORY_ALL, 'ブルガリアン 脚');
      const expectedOrder = [bulgarianA, bulgarianB]
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ja'));
      expect(result.map((e) => e.name)).toEqual(expectedOrder);
    });

    it('検索語が空/空白のみのときは関連度ソートを行わず、従来のカテゴリ順→名前順のまま', () => {
      const result = filterExercises([RELEVANCE_SUBSTRING, RELEVANCE_EXACT], CATEGORY_ALL, '');
      // 両方とも category: 'other' なので名前のlocaleCompare('ja')順になる
      const expected = [RELEVANCE_SUBSTRING, RELEVANCE_EXACT]
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ja'));
      expect(result.map((e) => e.name)).toEqual(expected);
    });

    it('既存のAND検索・あいまい検索フォールバックの結果集合は変わらない（ソートのみ変更）', () => {
      const result = filterExercises(ALL, CATEGORY_ALL, 'すくわっと');
      expect(result.map((e) => e.name)).toEqual(['スクワット']);
    });
  });

  describe('検索インデックスキャッシュの間引き', () => {
    it('種目が更新されてupdatedAtが変わると、古いキーはキャッシュから間引かれる', () => {
      // search を空にするとgetSearchIndexが一度も呼ばれないため、検索してインデックスを作らせる
      const original = make({ id: 30, name: 'テスト種目A', category: 'chest', updatedAt: 0 });
      filterExercises([original], CATEGORY_ALL, 'テスト種目A');
      expect(__getSearchIndexCacheSizeForTests()).toBe(1);

      // お気に入りトグルや編集を模して同じidでupdatedAtだけ変える
      const updated = { ...original, updatedAt: 1 };
      filterExercises([updated], CATEGORY_ALL, 'テスト種目A');

      // 新しいキーの分だけで、古いキーの残骸は残っていない
      expect(__getSearchIndexCacheSizeForTests()).toBe(1);
    });
  });
});
