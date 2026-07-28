import { ExerciseRecordHistoryList } from '@/components/exercises/exercise-record-history-list';
import type { ProgressPoint } from '@/lib/exercises/progress';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

const DAY = 86_400_000;
const BASE = new Date(2026, 4, 1).getTime();

function makePoint(index: number, weight: number): ProgressPoint {
  const set = {
    sessionId: index + 1,
    workoutSessionExerciseId: index + 1,
    setNumber: 1,
    weight,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
  };
  return {
    dateKey: BASE + index * 7 * DAY,
    startedAt: BASE + index * 7 * DAY,
    value: weight,
    best: set,
    sets: [set],
  };
}

function render(weights: number[]) {
  const onPressRecord = jest.fn();
  const onPressSeeAll = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <ExerciseRecordHistoryList
        points={weights.map((weight, index) => makePoint(index, weight))}
        measurementType="weight_reps"
        onPressRecord={onPressRecord}
        onPressSeeAll={onPressSeeAll}
      />,
    );
  });
  return { root: instance.root, onPressRecord, onPressSeeAll };
}

// <Text>全{n}件</Text> のように子が配列になるため、Textノード単位で連結して1つの文字列にする
const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

const buttonByLabel = (root: ReactTestInstance, label: string) =>
  root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);

describe('ExerciseRecordHistoryList', () => {
  test('見出しに全件数を出す（一覧に出すのは3件でも件数は全体）', () => {
    const { root } = render([60, 62.5, 65, 67.5, 70]);
    expect(texts(root)).toContain('過去の記録');
    expect(texts(root)).toContain('全5件');
  });

  test('今日から見た直近3件だけを新しい順に出す', () => {
    const { root } = render([60, 62.5, 65, 67.5, 70]);
    const all = texts(root).join(' ');
    // 直近3件（65/67.5/70）の要約だけが並ぶ
    expect(all).toContain('70kg×8');
    expect(all).toContain('67.5kg×8');
    expect(all).toContain('65kg×8');
    expect(all).not.toContain('62.5kg×8');
    expect(all).not.toContain('60kg×8');
  });

  test('3件以下なら「すべての記録を見る」を出さない（同じ一覧が出るだけのため）', () => {
    for (const weights of [[60, 65], [60, 65, 70]]) {
      const { root } = render(weights);
      expect(texts(root)).not.toContain('すべての記録を見る');
    }
  });

  test('4件以上なら「すべての記録を見る」を出す', () => {
    const { root, onPressSeeAll } = render([60, 62.5, 65, 67.5]);
    expect(texts(root)).toContain('すべての記録を見る');
    act(() => {
      buttonByLabel(root, 'この種目のすべての記録（全4件）を見る')!.props.onPress();
    });
    expect(onPressSeeAll).toHaveBeenCalled();
  });

  test('自己ベストの日にだけベストバッジが付く', () => {
    // 直近3件のうち中央（67.5）が全期間のベスト
    const { root } = render([60, 62.5, 65, 67.5, 65]);
    expect(texts(root).filter((t) => t === 'ベスト')).toHaveLength(1);
  });

  test('ベストが直近3件の外にあれば、一覧にはバッジが出ない', () => {
    const { root } = render([100, 62.5, 65, 67.5, 70]);
    expect(texts(root)).not.toContain('ベスト');
  });

  test('カードを押すとその日のセッションidを渡す', () => {
    const { root, onPressRecord } = render([60, 62.5, 65, 67.5]);
    const card = root
      .findAllByType(TouchableOpacity)
      .find((t) => String(t.props.accessibilityLabel).includes('67.5kg×8'))!;
    act(() => {
      card.props.onPress();
    });
    // 4件目（index 3）のセッションid
    expect(onPressRecord).toHaveBeenCalledWith(4);
  });
});
