import { ExerciseRecordDetailCard } from '@/components/exercises/exercise-record-detail-card';
import type { ProgressPoint, ProgressSet } from '@/lib/exercises/progress';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

function makeSet(setNumber: number, weight: number): ProgressSet {
  return {
    sessionId: 42,
    workoutSessionExerciseId: 1,
    setNumber,
    weight,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
  };
}

function makePoint(weights: number[]): ProgressPoint {
  const sets = weights.map((w, i) => makeSet(i + 1, w));
  const best = sets.reduce((a, b) => (b.weight! > a.weight! ? b : a));
  const dateKey = new Date(2026, 6, 23).getTime();
  return { dateKey, startedAt: dateKey, value: best.weight!, best, sets };
}

function render(weights: number[]) {
  const onPressOpen = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <ExerciseRecordDetailCard
        point={makePoint(weights)}
        measurementType="weight_reps"
        previousPoint={null}
        onPressOpen={onPressOpen}
      />,
    );
  });
  return { root: instance.root, onPressOpen };
}

const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

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
});
