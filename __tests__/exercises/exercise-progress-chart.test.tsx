import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { Colors } from '@/constants/theme';
import type {
  ProgressLeadIn,
  ProgressPoint,
  ProgressSet,
  ProgressUnit,
} from '@/lib/exercises/progress';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Circle, Path, Polygon } from 'react-native-svg';

const KG: ProgressUnit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' };

const DAY = 86_400_000;
const BASE = new Date(2026, 3, 12).getTime();
const WIDTH = 353;

function makePoint(index: number, value: number): ProgressPoint {
  const set: ProgressSet = {
    sessionId: index + 1,
    workoutSessionExerciseId: index + 1,
    setNumber: 1,
    weight: value,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
  };
  return {
    dateKey: BASE + index * 7 * DAY,
    startedAt: BASE + index * 7 * DAY,
    value,
    best: set,
    sets: [set],
  };
}

const POINTS = [60, 62.5, 75, 65, 70].map((v, i) => makePoint(i, v));
/** 最高点（75kg）の添字。印を確かめる対象 */
const HIGHLIGHT_INDEX = 2;

function render(options: {
  highlightKind: 'personal-best' | 'metric-max';
  selectedIndex?: number | null;
  highlight?: ProgressPoint | null;
  points?: ProgressPoint[];
  leadIn?: ProgressLeadIn | null;
}) {
  const points = options.points ?? POINTS;
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <ExerciseProgressChart
        points={points}
        unit={KG}
        highlight={options.highlight === undefined ? points[HIGHLIGHT_INDEX] : options.highlight}
        highlightKind={options.highlightKind}
        leadIn={options.leadIn ?? null}
        selectedIndex={options.selectedIndex ?? null}
        onSelect={jest.fn()}
      />,
    );
  });
  // 幅はonLayoutで自分で測るので、SVGを描かせるには測定結果を流し込む必要がある
  act(() => {
    instance.root.findByProps({ accessibilityRole: 'image' }).props.onLayout({
      nativeEvent: { layout: { width: WIDTH, height: 210 } },
    });
  });
  return instance.root;
}

const circles = (root: ReactTestInstance) => root.findAllByType(Circle).map((c) => c.props);

/** 半径で円を1つ引く。印は半径がそれぞれ固有なので、これで層を特定できる */
const circleWithRadius = (root: ReactTestInstance, r: number) =>
  circles(root).find((c) => c.r === r);

describe('ExerciseProgressChart: 集計系の指標の最高点マーカー（FIX-16）', () => {
  test('未選択の最高点は「白い円＋ブルーの輪＋白抜きの点」になる', () => {
    const root = render({ highlightKind: 'metric-max' });

    // 輪が折れ線から切り離されて読めるようにする下敷き
    const backing = circleWithRadius(root, 7.6);
    expect(backing).toMatchObject({ fill: Colors.surface });
    const ring = circleWithRadius(root, 6);
    expect(ring).toMatchObject({ fill: 'none', stroke: Colors.accent, strokeWidth: 1.2 });
    // 通常のマーカーはそのまま。輪を足しただけで寸法は変えない
    expect(circleWithRadius(root, 3)).toMatchObject({
      fill: Colors.surface,
      stroke: Colors.accent,
    });
  });

  test('輪は不透明のまま。半透明だと白背景で3.3:1しか出ず、面塗りと重なると消える', () => {
    const root = render({ highlightKind: 'metric-max' });
    const ring = circleWithRadius(root, 6);

    expect(ring?.opacity).toBeUndefined();
    expect(ring?.strokeOpacity).toBeUndefined();
  });

  test('最高点を選択中は白い円を描かない。選択のハローを消してしまうため', () => {
    const root = render({ highlightKind: 'metric-max', selectedIndex: HIGHLIGHT_INDEX });

    expect(circleWithRadius(root, 7.6)).toBeUndefined();
    // ハロー・輪・青玉の3重円。通常の選択点は2重円なので形で区別が付く
    expect(circleWithRadius(root, 9.5)).toMatchObject({ fill: Colors.accent });
    expect(circleWithRadius(root, 6)).toMatchObject({ stroke: Colors.accent });
    expect(circleWithRadius(root, 4.5)).toMatchObject({
      fill: Colors.accent,
      stroke: Colors.surface,
    });
  });

  test('最高点以外を選択しても最高点の輪は残る', () => {
    const root = render({ highlightKind: 'metric-max', selectedIndex: 0 });

    expect(circleWithRadius(root, 7.6)).toBeDefined();
    expect(circleWithRadius(root, 6)).toBeDefined();
  });

  test('チップに点と同じ輪のグリフが付く。★は出さない', () => {
    const root = render({ highlightKind: 'metric-max' });

    expect(root.findAllByType(Polygon)).toHaveLength(0);
    expect(circleWithRadius(root, 3.9)).toMatchObject({
      fill: 'none',
      stroke: Colors.accent,
      strokeWidth: 1.1,
    });
    expect(circleWithRadius(root, 1.5)).toMatchObject({
      fill: Colors.surface,
      stroke: Colors.accent,
      strokeWidth: 1.1,
    });
  });

  test('最高値が表示期間の外にあるときは、点の印は出さずチップのグリフだけ出す', () => {
    // 表示中の点列に含まれない日を最高値として渡す（期間で絞った結果と同じ状態）
    const outside = makePoint(-10, 90);
    const root = render({ highlightKind: 'metric-max', highlight: outside });

    expect(circleWithRadius(root, 7.6)).toBeUndefined();
    expect(circleWithRadius(root, 6)).toBeUndefined();
    // チップは値を出し続けるので、グリフも出る
    expect(circleWithRadius(root, 3.9)).toBeDefined();
  });
});

describe('ExerciseProgressChart: 実測ベストは従来どおり（FIX-10）', () => {
  test('アンバーの点と★のチップのまま。輪は足さない', () => {
    const root = render({ highlightKind: 'personal-best' });

    expect(circleWithRadius(root, 7.6)).toBeUndefined();
    expect(circleWithRadius(root, 6)).toBeUndefined();
    expect(circleWithRadius(root, 3.9)).toBeUndefined();
    expect(root.findAllByType(Polygon)).toHaveLength(1);
    expect(circleWithRadius(root, 4)).toMatchObject({ fill: Colors.chartBest });
  });

  test('選択中もアンバーのまま', () => {
    const root = render({ highlightKind: 'personal-best', selectedIndex: HIGHLIGHT_INDEX });

    expect(circleWithRadius(root, 6)).toBeUndefined();
    expect(circleWithRadius(root, 4.5)).toMatchObject({ fill: Colors.chartBest });
  });
});

describe('ExerciseProgressChart: 期間の外から伸ばす線', () => {
  const ONLY = [makePoint(0, 70)];
  const LEAD_IN: ProgressLeadIn = {
    point: makePoint(-9, 65),
    windowStart: BASE - 30 * DAY,
  };

  /** 折れ線本体。面塗りのPathはstrokeを持たないので、これで1本に絞れる */
  const linePath = (root: ReactTestInstance) =>
    root.findAllByType(Path).find((p) => p.props.stroke === Colors.accent)?.props.d as
      | string
      | undefined;

  test('期間内の点が1つでも、期間の外の記録があれば線が引かれる', () => {
    const root = render({ highlightKind: 'personal-best', points: ONLY, leadIn: LEAD_IN });

    // M（入り口）→ L（唯一の点）の2点で1本の線になる
    expect(linePath(root)).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
  });

  test('期間の外に記録が無ければ従来どおり線を引かない', () => {
    const root = render({ highlightKind: 'personal-best', points: ONLY, leadIn: null });

    expect(linePath(root)).toBeUndefined();
  });

  test('期間外の記録にマーカーは足さない。点は1つのまま', () => {
    const withLine = render({ highlightKind: 'personal-best', points: ONLY, leadIn: LEAD_IN });
    const withoutLine = render({ highlightKind: 'personal-best', points: ONLY, leadIn: null });

    expect(circles(withLine).length).toBe(circles(withoutLine).length);
  });

  test('読み上げにも「期間の前の記録から線が続いている」ことを添える', () => {
    const root = render({ highlightKind: 'personal-best', points: ONLY, leadIn: LEAD_IN });

    expect(root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel).toContain(
      '期間の前の記録（2/8・65kg）から線が続いています',
    );
  });
});
