import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SummaryExerciseList } from '@/components/workout/summary-exercise-list';
import type { RecordedExerciseCard } from '@/hooks/use-session-exercise-cards';

const onPress = jest.fn();
const onRetry = jest.fn();

function card(over: Partial<RecordedExerciseCard> = {}): RecordedExerciseCard {
  return {
    workoutSessionExerciseId: 1,
    exerciseId: 10,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'bench-press',
    sets: [{ setNumber: 1, weight: 100, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
    sessionId: 1,
    sessionStartedAt: 0,
    isBest: false,
    comparison: null,
    ...over,
  };
}

function render(cards: RecordedExerciseCard[] | 'error' | null) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryExerciseList, { cards, onPressExercise: onPress, onRetry }));
  });
  return instance.root;
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) =>
      [t.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''),
    )
    .filter((s) => s.length > 0);
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('見出しに件数を出し、渡されたカードを並べる', () => {
  const root = render([card(), card({ workoutSessionExerciseId: 2, name: 'ケーブルフライ' })]);

  expect(texts(root)).toEqual(expect.arrayContaining(['種目', '全2件', 'ベンチプレス', 'ケーブルフライ']));
});

test('カードをタップすると呼び出し側にそのカードを渡す', () => {
  const target = card({ workoutSessionExerciseId: 7, name: 'ディップス' });
  const root = render([target]);

  const button = root
    .findAllByType(TouchableOpacity)
    .find((b) => b.findAllByType(Text).some((t) => [t.props.children].flat().join('') === 'ディップス'))!;
  act(() => {
    button.props.onPress();
  });

  expect(onPress).toHaveBeenCalledWith(target);
});

// 読み込み中に「全0件」を出すと、種目が1件も無かったように一瞬見えてしまう
test('読み込み中は何も描かない', () => {
  const root = render(null);

  expect(texts(root)).toHaveLength(0);
});

// 数値もみんなの声も出ている画面なので、この枠だけ理由を出す。見出しを残すのは、
// セクションごと消えると「そもそも種目が無かった」と読めてしまうため
test('取得に失敗した場合は理由と見出しを出し、再試行できる', () => {
  const root = render('error');

  expect(texts(root)).toEqual(expect.arrayContaining(['種目', '種目を読み込めませんでした']));

  const retryButton = root
    .findAllByType(TouchableOpacity)
    .find((b) => b.props.accessibilityLabel === '再試行')!;
  act(() => {
    retryButton.props.onPress();
  });
  expect(onRetry).toHaveBeenCalled();
});

// 記録編集で✓を全部外して戻ってくると到達する。見出しだけが浮くと消えたように見える
test('0件なら見出しに加えて理由を1行出す', () => {
  const root = render([]);

  expect(texts(root)).toEqual(
    expect.arrayContaining(['種目', '全0件', '種目がありません']),
  );
});
