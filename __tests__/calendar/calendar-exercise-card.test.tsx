import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Path } from 'react-native-svg';
import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { Colors } from '@/constants/theme';

const onPress = jest.fn();

function render(props: Partial<Parameters<typeof CalendarExerciseCard>[0]> = {}) {
  const merged = {
    exerciseId: 1,
    name: 'ベンチプレス',
    category: 'chest',
    source: 'preset',
    slug: 'bench-press',
    measurementType: 'weight_reps',
    sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
    isBest: false,
    comparison: null,
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<CalendarExerciseCard {...merged} />);
  });
  return root;
}

beforeEach(() => {
  onPress.mockClear();
});

describe('CalendarExerciseCard', () => {
  it('種目名・セット概要を表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
    expect(texts.some((t) => typeof t === 'string' && t.includes('60kg'))).toBe(true);
  });

  it('isBest=trueのとき自己ベストバッジを表示する（表示文言は2行折返し防止のため「ベスト」に短縮）', () => {
    const root = render({ isBest: true });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベスト');
  });

  it('isBest=falseのとき自己ベストバッジを表示しない', () => {
    const root = render({ isBest: false });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('ベスト');
  });

  // 遷移先の判断（種目詳細か記録編集画面か）は呼び出し元(app/(tabs)/calendar.tsxのDayCardList)の
  // 責務のため、このカード自身は引数無しでonPressを呼ぶだけでよい（2026-07-20）
  it('カード（全体）をタップするとonPressが呼ばれる', () => {
    const root = render();
    act(() => {
      (root.root.findByType(TouchableOpacity).props.onPress as () => void)();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accessibilityLabelに種目名・カテゴリ名・概要・自己ベストの有無を含む', () => {
    const root = render({ isBest: true });
    const label = root.root.findByType(TouchableOpacity).props.accessibilityLabel as string;
    expect(label).toContain('ベンチプレス');
    expect(label).toContain('胸');
    expect(label).toContain('自己ベスト');
  });

  // 遷移先が文脈（今日パネル/過去日パネル）で変わるため、accessibilityLabelとは別に
  // 呼び出し元から渡されたhintをそのまま反映する（@designer指摘）
  it('accessibilityHintを渡すとそのまま反映される', () => {
    const root = render({ accessibilityHint: 'タップして記録を編集します' });
    expect(root.root.findByType(TouchableOpacity).props.accessibilityHint).toBe('タップして記録を編集します');
  });

  it('✓未確定(completedAt: null)のセットはセット数・概要の集計から除外される（自己ベスト判定と基準を揃える）', () => {
    const root = render({
      sets: [
        { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 },
        // プリフィルされただけの未確定セット。値はあるがカウントされてはいけない
        { weight: 100, reps: 20, durationSeconds: null, distanceMeters: null, completedAt: null },
      ],
    });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    // 確定セットは1件のみなので「1セット・60kg×8」になり、未確定の100kg×20は反映されない
    expect(texts.some((t) => typeof t === 'string' && t.includes('1セット'))).toBe(true);
    expect(texts.some((t) => typeof t === 'string' && t.includes('100kg'))).toBe(false);
  });

  it('確定セットが1件も無ければ「0セット」表示になる', () => {
    const root = render({
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: null }],
    });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('0セット');
  });

  it('measurementTypeがweight_reps以外でも概要表示が切り替わる（reps計測）', () => {
    const root = render({
      measurementType: 'reps',
      sets: [{ weight: null, reps: 15, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
    });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts.some((t) => typeof t === 'string' && t.includes('15回'))).toBe(true);
  });

  it('未知のmeasurementType文字列はweight_repsとしてフォールバック表示される', () => {
    const root = render({
      measurementType: 'legacy-unknown-type',
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
    });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts.some((t) => typeof t === 'string' && t.includes('60kg'))).toBe(true);
  });

  describe('前回比較(comparison)', () => {
    it('comparisonが無ければ比較表示をしない', () => {
      const root = render({ comparison: null });
      const texts = root.root.findAllByType(Text).map((t) => t.props.children);
      expect(texts).not.toContain('+2.5kg');
    });

    it('増加していれば緑文字(デザイン案指定の#15803D)でラベルを表示する', () => {
      const root = render({ comparison: { field: 'weight', delta: 2.5, label: '+2.5kg' } });
      const text = root.root.findAllByType(Text).find((t) => t.props.children === '+2.5kg')!;
      expect(text.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: Colors.success })]));
    });

    it('減少していれば赤文字(デザイン案指定の#DC2626、Colors.dangerと同値)でラベルを表示する', () => {
      const root = render({ comparison: { field: 'reps', delta: -2, label: '-2回' } });
      const text = root.root.findAllByType(Text).find((t) => t.props.children === '-2回')!;
      expect(text.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: Colors.danger })]));
    });

    it('accessibilityLabelに前回比較を含む', () => {
      const root = render({ comparison: { field: 'weight', delta: 2.5, label: '+2.5kg' } });
      const label = root.root.findByType(TouchableOpacity).props.accessibilityLabel as string;
      expect(label).toContain('+2.5kg');
    });
  });
});

// ExerciseIdentity → ExerciseThumbnail 経由でサムネイルを出しているため、素材の有無の
// 出し分けがこのカードまで届いていることを押さえる（カスタム種目に他種目の写真が出る回帰の防止）
describe('サムネイル: 素材の有無', () => {
  // カードには他のアイコン（塗りのMaterial Symbols）も載るため、線画＝fill無しで絞り込む
  const placeholders = (root: ReturnType<typeof render>) =>
    root.root.findAllByType(Path).filter((p) => p.props.fill === 'none');

  it('preset種目は写真を出す', () => {
    const root = render({ source: 'preset', slug: 'bench_press' });
    expect(root.root.findAllByType(Image)).toHaveLength(1);
    expect(placeholders(root)).toHaveLength(0);
  });

  it('カスタム種目は写真を出さず、プレースホルダーの線画にする', () => {
    const root = render({ source: 'custom', slug: null });
    expect(root.root.findAllByType(Image)).toHaveLength(0);
    expect(placeholders(root)).toHaveLength(1);
  });
});
