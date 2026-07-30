import { ExerciseRecordDetailCard } from '@/components/exercises/exercise-record-detail-card';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { ProgressPoint, ProgressSet } from '@/lib/exercises/progress';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

type SetValues = Partial<Pick<ProgressSet, 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters'>>;

function makeSet(setNumber: number, values: SetValues): ProgressSet {
  return {
    sessionId: 42,
    workoutSessionExerciseId: 1,
    setNumber,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
    ...values,
  };
}

/** 重量種目の点。ベストは最大重量のセット（同値なら先にやった方） */
function makePoint(weights: number[]): ProgressPoint {
  return pointOf(weights.map((weight) => ({ weight, reps: 8 })), (s) => s.weight!);
}

function pointOf(values: SetValues[], metric: (set: ProgressSet) => number): ProgressPoint {
  const sets = values.map((v, i) => makeSet(i + 1, v));
  const best = sets.reduce((a, b) => (metric(b) > metric(a) ? b : a));
  const dateKey = new Date(2026, 6, 23).getTime();
  return { dateKey, startedAt: dateKey, value: metric(best), best, sets };
}

function renderCard(props: {
  point: ProgressPoint;
  measurementType?: MeasurementType;
  previousPoint?: ProgressPoint | null;
  isPersonalBest?: boolean;
  metricRow?: { label: string; value: string } | null;
}) {
  const onPressOpen = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <ExerciseRecordDetailCard
        point={props.point}
        measurementType={props.measurementType ?? 'weight_reps'}
        previousPoint={props.previousPoint ?? null}
        isPersonalBest={props.isPersonalBest ?? false}
        metricRow={props.metricRow ?? null}
        onPressOpen={onPressOpen}
      />,
    );
  });
  return { root: instance.root, onPressOpen };
}

const render = (weights: number[], isPersonalBest = false) =>
  renderCard({ point: makePoint(weights), isPersonalBest });

const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

const styleOf = (root: ReactTestInstance, value: string) =>
  StyleSheet.flatten(root.findAllByType(Text).find((t) => t.props.children === value)!.props.style);

const buttonByLabel = (root: ReactTestInstance, label: string) =>
  root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);

describe('ExerciseRecordDetailCard', () => {
  test('カード全体がタップ領域で、押すとその日のセッションidを渡す', () => {
    const { root, onPressOpen } = render([60, 75, 70]);
    // カード自身が一番外側のTouchableOpacity
    const card = root.findAllByType(TouchableOpacity)[0];
    act(() => {
      card.props.onPress();
    });
    expect(onPressOpen).toHaveBeenCalledWith(42);
  });

  test('8セット以上は畳まれ、「他N件を見る」で展開できる（カード全体のタップとは別に動く）', () => {
    const { root, onPressOpen } = render([60, 60, 60, 60, 75, 60, 60, 60, 60, 60]);
    expect(texts(root)).toContain('他5件を見る');

    act(() => {
      buttonByLabel(root, '残り5件のセットを表示')!.props.onPress();
    });

    // 展開しただけで遷移はしない
    expect(onPressOpen).not.toHaveBeenCalled();
    expect(texts(root)).toContain('折りたたむ');
    expect(texts(root)).toContain('10セット');
  });

  test('7セット以下は畳まない', () => {
    const { root } = render([60, 60, 60, 60, 75, 60, 60]);
    expect(texts(root)).not.toContain('他2件を見る');
    expect(texts(root)).toContain('7セット');
  });

  test('値・単位・回数が別々のセルに分かれる（列を縦に揃えるため）', () => {
    const { root } = render([60, 75]);
    // 「75kg × 8」を1つのテキストにまとめず、値／単位／回数で分ける
    expect(texts(root)).toEqual(expect.arrayContaining(['60', '75', 'kg', '× 8']));
  });

  test('その日の最大セットは★を持たず、値の大きさと太さだけで示す', () => {
    const { root } = render([60, 75]);
    // 旧形のアンバーの★はグラフの自己ベストの点と紛らわしいので廃止した
    expect(root.findAllByType(DesignIcon).some((i) => i.props.name === 'star')).toBe(false);

    expect(styleOf(root, '75').fontWeight).toBe('700');
    expect(styleOf(root, '75').fontSize).toBeGreaterThan(styleOf(root, '60').fontSize);
  });

  test('自己ベストの日だけアンバーのバッジが独立した行に出る', () => {
    const best = render([60, 75], true).root;
    expect(texts(best)).toContain('自己ベスト');
    // 読み上げでもバッジの存在が分かるようにカードのラベルにも含める
    expect(best.findAllByType(TouchableOpacity)[0].props.accessibilityLabel).toContain('自己ベスト');

    expect(texts(render([60, 75], false).root)).not.toContain('自己ベスト');
  });

  test('✓未確定のセットは値を出さず「未実施」を値の列に置く', () => {
    const point = makePoint([60, 75]);
    point.sets.push({ ...makeSet(3, { weight: 70, reps: 8 }), completedAt: null });
    const { root } = renderCard({ point });

    expect(texts(root)).toContain('未実施');
    // 未実施の行には単位・回数の列を出さない
    expect(texts(root)).not.toContain('70');
    expect(texts(root).filter((t) => t === 'kg')).toHaveLength(2);
  });

  describe('列幅の揃え方', () => {
    const textNode = (root: ReactTestInstance, label: string) =>
      root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === label)!;

    // セルのViewのminWidth。onLayoutは中のTextに付けて「自然幅」を測り、幅は親のViewが受ける
    const cellWidth = (root: ReactTestInstance, label: string) =>
      StyleSheet.flatten(textNode(root, label).parent!.props.style).minWidth;

    const layout = (root: ReactTestInstance, widths: Record<string, number>) => {
      act(() => {
        for (const [label, width] of Object.entries(widths)) {
          textNode(root, label).props.onLayout({ nativeEvent: { layout: { width } } });
        }
      });
    };

    test('値のセルはそのカードで一番長い値の幅に揃う', () => {
      const { root } = render([62.5, 112.5]);
      layout(root, { '62.5': 26, '112.5': 34 });

      expect(cellWidth(root, '62.5')).toBe(34);
      expect(cellWidth(root, '112.5')).toBe(34);
    });

    test('展開で広がった列幅は畳むと元に戻る', () => {
      const { root } = render([60, 60, 60, 60, 75, 60, 60, 60, 60, 60]);
      layout(root, { '3セット': 40, '4セット': 40, '5セット': 40, '6セット': 40, '7セット': 40 });
      expect(cellWidth(root, '5セット')).toBe(40);

      act(() => {
        buttonByLabel(root, '残り5件のセットを表示')!.props.onPress();
      });
      // 2桁になる「10セット」のぶんだけ広がる
      layout(root, { '10セット': 46 });
      expect(cellWidth(root, '5セット')).toBe(46);

      act(() => {
        buttonByLabel(root, 'セットの表示を折りたたむ')!.props.onPress();
      });
      // 畳んだら見えている行だけで幅を決め直すので元に戻る
      expect(cellWidth(root, '5セット')).toBe(40);
    });
  });

  describe('計測タイプ別の行表示', () => {
    test('回数種目は単位が「回」で、その後ろの列は空', () => {
      const point = pointOf([{ reps: 12 }, { reps: 16 }], (s) => s.reps!);
      const { root } = renderCard({ point, measurementType: 'reps' });
      expect(texts(root)).toEqual(expect.arrayContaining(['12', '16', '回']));
      expect(texts(root).some((t) => t.startsWith('×'))).toBe(false);
    });

    test('時間種目は"分:秒"が自己説明的なので単位のセル自体を出さない', () => {
      const point = pointOf([{ durationSeconds: 60 }, { durationSeconds: 90 }], (s) => s.durationSeconds!);
      const { root } = renderCard({ point, measurementType: 'time' });
      expect(texts(root)).toEqual(expect.arrayContaining(['1:00', '1:30']));
      expect(texts(root)).not.toContain('秒');
    });

    test('距離種目は距離が値、時間が後ろの列になる', () => {
      const point = pointOf([{ distanceMeters: 3500, durationSeconds: 1500 }], (s) => s.distanceMeters!);
      const { root } = renderCard({ point, measurementType: 'distance_time' });
      expect(texts(root)).toEqual(expect.arrayContaining(['3.5', 'km', '× 25:00']));
    });

    test('加重ホールド種目は重量が値、時間が後ろの列になる', () => {
      const point = pointOf([{ weight: 20, durationSeconds: 45 }], (s) => s.weight!);
      const { root } = renderCard({ point, measurementType: 'weight_time' });
      expect(texts(root)).toEqual(expect.arrayContaining(['20', 'kg', '× 0:45']));
    });
  });

  describe('前回比', () => {
    test('その日の最大セットの行にだけ出る', () => {
      const { root } = renderCard({ point: makePoint([60, 75, 70]), previousPoint: makePoint([65]) });
      // 3行あっても「前回比」は最大セットの行の1つだけ
      expect(texts(root).filter((t) => t === '前回比')).toHaveLength(1);
      expect(texts(root)).toContain('+10kg');
    });

    test('増加はグリーン、減少はレッドで出す', () => {
      const up = renderCard({ point: makePoint([75]), previousPoint: makePoint([60]) }).root;
      expect(styleOf(up, '+15kg').color).toBe(Colors.success);

      const down = renderCard({ point: makePoint([60]), previousPoint: makePoint([75]) }).root;
      expect(styleOf(down, '-15kg').color).toBe(Colors.danger);
    });

    test('直前の記録が無い（最初の記録）なら出さない', () => {
      expect(texts(render([60, 75]).root)).not.toContain('前回比');
    });

    test('直前の記録と変化が無ければ出さない', () => {
      const { root } = renderCard({ point: makePoint([60, 75]), previousPoint: makePoint([60, 75]) });
      expect(texts(root)).not.toContain('前回比');
    });

    test('畳まれていても最大セットの行は窓に残るので前回比が読める', () => {
      const { root } = renderCard({
        point: makePoint([60, 60, 60, 60, 75, 60, 60, 60, 60, 60]),
        previousPoint: makePoint([65]),
      });
      expect(texts(root)).toContain('他5件を見る');
      expect(texts(root)).toContain('+10kg');
    });
  });
});
