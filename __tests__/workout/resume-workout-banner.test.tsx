import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ResumeWorkoutBanner } from '@/components/workout/resume-workout-banner';

function render(overrides: Partial<Parameters<typeof ResumeWorkoutBanner>[0]> = {}) {
  const onPress = jest.fn();
  const merged = {
    routineName: '胸の日',
    elapsedLabel: '12:34',
    completedExerciseCount: 2,
    totalExerciseCount: 5,
    completedSetCount: 8,
    onPress,
    ...overrides,
  };
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<ResumeWorkoutBanner {...merged} />);
  });
  return { root: root.root, onPress };
}

describe('ResumeWorkoutBanner', () => {
  it('タイトル・経過時間・種目数・セット数を表示する', () => {
    const { root } = render();
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('胸の日');
    expect(texts.some((t) => Array.isArray(t) && t.join('') === '進行中・12:34')).toBe(true);
    expect(texts).toContain('2/5種目 ・ 8セット完了');
  });

  it('routineNameがnull（手動開始）のときは「トレーニング中」を表示する', () => {
    const { root } = render({ routineName: null });
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('トレーニング中');
  });

  it('種目が1件も無い（totalExerciseCount=0）場合は「0/0種目」ではなく専用の文言を表示する', () => {
    const { root } = render({ completedExerciseCount: 0, totalExerciseCount: 0, completedSetCount: 0 });
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('まだ種目が追加されていません');
    expect(texts.some((t) => typeof t === 'string' && t.includes('0/0種目'))).toBe(false);
  });

  it('カード（全体）をタップするとonPressが呼ばれる', () => {
    const { root, onPress } = render();
    act(() => {
      (root.findByType(TouchableOpacity).props.onPress as () => void)();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('カード全体が1つのTouchableOpacityで、accessibilityLabelに経過時間・タイトル・種目数/セット数をまとめる', () => {
    const { root } = render();
    const card = root.findByType(TouchableOpacity);
    expect(card.props.accessibilityLabel).toBe('進行中・12:34、胸の日、2/5種目 ・ 8セット完了');
    expect(card.props.accessibilityHint).toBe('タップしてトレーニング画面を開きます');
  });
});
