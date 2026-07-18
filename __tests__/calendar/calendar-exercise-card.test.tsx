import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
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

  it('カード（全体）をタップするとexerciseIdを渡してonPressが呼ばれる', () => {
    const root = render({ exerciseId: 42 });
    act(() => {
      (root.root.findByType(TouchableOpacity).props.onPress as () => void)();
    });
    expect(onPress).toHaveBeenCalledWith(42);
  });

  it('accessibilityLabelに種目名・カテゴリ名・概要・自己ベストの有無を含む', () => {
    const root = render({ isBest: true });
    const label = root.root.findByType(TouchableOpacity).props.accessibilityLabel as string;
    expect(label).toContain('ベンチプレス');
    expect(label).toContain('胸');
    expect(label).toContain('自己ベスト');
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
