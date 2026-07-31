const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseExercise = jest.fn();
const mockToggleFavorite = jest.fn();
const mockRemoveExercise = jest.fn();
const mockPlayerPlay = jest.fn();
const mockPlayerPause = jest.fn();
const mockUseExerciseRecordCount = jest.fn();
const mockUseExerciseProgress = jest.fn();
const mockStartWorkoutWithExercise = jest.fn();
const mockUseWorkoutSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: '1' }),
  // 動画(Mp4Player)はフォーカスを失うと再生を止める。ここでは即時実行して
  // マウント時にplay()が走る本番と同じ状態にする
  useFocusEffect: (effect: () => (() => void) | void) => {
    const cleanup = effect();
    return cleanup;
  },
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（⋮ボタン）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercise: (...args: unknown[]) => mockUseExercise(...args),
  useExercises: () => ({
    toggleFavorite: mockToggleFavorite,
    removeExercise: mockRemoveExercise,
  }),
}));

// 記録件数・グラフの系列はdb/client（expo-sqlite）に触るため、useExercisesと同じ流儀で
// フックごと差し替える
jest.mock('@/hooks/use-exercise-record-count', () => ({
  useExerciseRecordCount: (...args: unknown[]) => mockUseExerciseRecordCount(...args),
}));

jest.mock('@/hooks/use-exercise-progress', () => ({
  useExerciseProgress: (...args: unknown[]) => mockUseExerciseProgress(...args),
}));

// 記録タブの「1回目を記録する」がdb/client（expo-sqlite）へ辿るのを断つ
jest.mock('@/lib/workout/session', () => ({
  startWorkoutWithExercise: (...args: unknown[]) => mockStartWorkoutWithExercise(...args),
  endWorkoutSession: jest.fn(),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
}));

jest.mock('expo-video', () => ({
  // Mp4Playerがフォーカス連動でplay/pauseを呼ぶ（タブ配下では画面が残り続けるため、
  // 裏で動画がループしないようblur時に止めている）
  useVideoPlayer: () => ({ play: mockPlayerPlay, pause: mockPlayerPause }),
  VideoView: 'VideoView',
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Modal, Text, TouchableOpacity } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';
import { getYoutubeSearchUrl } from '@/lib/exercises/youtube';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Exercise } from '@/db/schema';
import ExerciseDetailScreen from '@/app/exercise/[id]';

const TEST_SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: 'ベンチプレス',
    slug: null,
    category: 'chest',
    favorite: false,
    note: null,
    formPoints: null,
    source: 'custom',
    measurementType: 'weight_reps',
    pairedWeights: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t: ReactTestInstance) => t.props.children)
    .flat();
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) => btn.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(
        SafeAreaProvider,
        { initialMetrics: TEST_SAFE_AREA_METRICS },
        React.createElement(ExerciseDetailScreen),
      ),
    );
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  // 既存のテストはすべて解説タブの中身を見るため、既定は「記録0件＝解説タブが初期表示」にしておく
  mockUseExerciseRecordCount.mockReturnValue({ count: 0, loaded: true });
  const emptySeries = {
    unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
    points: [],
  };
  mockUseExerciseProgress.mockReturnValue({
    series: emptySeries,
    bestSeries: emptySeries,
    recordDays: [],
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: false,
  });
  mockUseWorkoutSessions.mockReturnValue({ sessions: [], activeSession: null });
  mockStartWorkoutWithExercise.mockResolvedValue({ sessionId: 1 });
  mockToggleFavorite.mockResolvedValue(undefined);
  mockRemoveExercise.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('メモ表示（プリセットのnoteが握りつぶされるバグの再発防止）', () => {
  test('guideありnoteありのとき、ガイドとメモの両方が表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({
        source: 'preset',
        slug: 'bench_press',
        note: 'ユーザー独自メモ',
      }),
      loaded: true,
    });

    const root = render();
    const texts = allTexts(root);
    expect(texts).toContain('大胸筋・三角筋前部・上腕三頭筋'); // guide.muscle
    expect(texts).toContain('ユーザー独自メモ'); // note
  });

  test('guideありnoteなしのとき、メモセクションは表示されない', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'preset', slug: 'bench_press', note: null }),
      loaded: true,
    });

    const root = render();
    expect(allTexts(root)).not.toContain('メモ');
  });

  test('guideなしnoteありのとき、メモのみ表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom', slug: null, note: 'カスタム種目のメモ' }),
      loaded: true,
    });

    const root = render();
    const texts = allTexts(root);
    expect(texts).toContain('メモ');
    expect(texts).toContain('カスタム種目のメモ');
  });

  test('guideなしnoteなしのとき「解説はまだありません」が表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom', slug: null, note: null }),
      loaded: true,
    });

    const root = render();
    expect(allTexts(root)).toContain('この種目の解説はまだありません');
  });
});

describe('フォームのポイント表示（カスタム種目のformPointsが書き込み専用になるバグの再発防止）', () => {
  test('guideなしformPointsありのとき、フォームのポイントが表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({
        source: 'custom',
        slug: null,
        formPoints: JSON.stringify(['肩甲骨を寄せる', 'バーを胸に下ろす']),
      }),
      loaded: true,
    });

    const root = render();
    const texts = allTexts(root);
    expect(texts).toContain('フォームのポイント');
    expect(texts).toContain('肩甲骨を寄せる');
    expect(texts).toContain('バーを胸に下ろす');
    expect(texts).not.toContain('この種目の解説はまだありません');
  });

  test('guideなしformPointsなしnoteなしのとき「解説はまだありません」が表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom', slug: null, formPoints: null, note: null }),
      loaded: true,
    });

    const root = render();
    expect(allTexts(root)).toContain('この種目の解説はまだありません');
  });

  test('guideありのとき、exercise.formPointsが設定されていてもguide側のフォームのポイントのみ表示される（重複しない）', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({
        source: 'preset',
        slug: 'bench_press',
        formPoints: JSON.stringify(['カスタムで上書きしたポイント']),
      }),
      loaded: true,
    });

    const root = render();
    const texts = allTexts(root);
    const pointsHeadingCount = texts.filter((t: unknown) => t === 'フォームのポイント').length;
    expect(pointsHeadingCount).toBe(1);
    expect(texts).not.toContain('カスタムで上書きしたポイント');
  });
});

describe('⋮メニュー: 削除はカスタム種目のみ表示', () => {
  test('source=customのとき削除メニューが表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom' }),
      loaded: true,
    });

    const root = render();
    const menuBtn = findButtonByLabel(root, '種目のメニューを開く')!;
    act(() => {
      menuBtn.props.onPress();
    });

    expect(findButtonByLabel(root, '削除')).toBeDefined();
    expect(findButtonByLabel(root, '編集')).toBeDefined();
  });

  test('source=presetのとき削除メニューは表示されない', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'preset', slug: 'bench_press' }),
      loaded: true,
    });

    const root = render();
    const menuBtn = findButtonByLabel(root, '種目のメニューを開く')!;
    act(() => {
      menuBtn.props.onPress();
    });

    expect(findButtonByLabel(root, '削除')).toBeUndefined();
    expect(findButtonByLabel(root, '編集')).toBeDefined();
  });

  test('削除確定→成功時にrouter.backが呼ばれる', async () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom' }),
      loaded: true,
    });
    (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
      const deleteBtn = buttons?.find((b: { text: string }) => b.text === '削除');
      deleteBtn?.onPress?.();
    });

    const root = render();
    const menuBtn = findButtonByLabel(root, '種目のメニューを開く')!;
    act(() => {
      menuBtn.props.onPress();
    });
    const deleteMenuItem = findButtonByLabel(root, '削除')!;
    await act(async () => {
      deleteMenuItem.props.onPress();
    });

    expect(mockRemoveExercise).toHaveBeenCalledWith(1);
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('お気に入りトグル（楽観的UI + ロールバック）', () => {
  test('toggleFavorite失敗時は元の状態に戻りAlertが表示される', async () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ favorite: false }),
      loaded: true,
    });
    mockToggleFavorite.mockRejectedValueOnce(new Error('fail'));

    const root = render();
    const favoriteBtn = findButtonByLabel(root, 'お気に入りに追加')!;
    await act(async () => {
      await favoriteBtn.props.onPress();
    });

    expect(mockToggleFavorite).toHaveBeenCalledWith(1, true);
    expect(Alert.alert).toHaveBeenCalledWith('エラー', 'お気に入りの更新に失敗しました。');
    // ロールバック後は再び「お気に入りに追加」ラベルに戻っている
    expect(findButtonByLabel(root, 'お気に入りに追加')).toBeDefined();
  });
});

describe('画面の基本ケース', () => {
  test('loaded=falseのとき何もレンダリングしない', () => {
    mockUseExercise.mockReturnValue({ exercise: undefined, loaded: false });
    const root = render();
    expect(root.findAllByType(Text)).toHaveLength(0);
  });

  test('exerciseが見つからないとき「見つかりません」が表示される', () => {
    mockUseExercise.mockReturnValue({ exercise: undefined, loaded: true });
    const root = render();
    expect(allTexts(root)).toContain('種目が見つかりません');
  });
});

describe('記録／解説タブ', () => {
  const presetExercise = () => ({
    exercise: makeExercise({ source: 'preset', slug: 'bench_press' }),
    loaded: true,
  });

  test('記録0件のときは解説タブが初期表示になる', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 0, loaded: true });

    const root = render();
    expect(allTexts(root)).toContain('使う筋肉');
  });

  test('記録1件以上のときは記録タブが初期表示になり、期間チップが出る', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 1, loaded: true });

    const root = render();
    const texts = allTexts(root);
    expect(texts).not.toContain('使う筋肉');
    expect(texts).toContain('3ヶ月');
  });

  test('記録件数がまだ読み込めていないうちは、タブが確定しないので何も描かない', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 0, loaded: false });

    const root = render();
    expect(root.findAllByType(Text)).toHaveLength(0);
  });

  test('タブを押すと表示が切り替わる', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 3, loaded: true });

    const root = render();
    expect(allTexts(root)).not.toContain('使う筋肉');

    act(() => {
      findButtonByLabel(root, '解説')!.props.onPress();
    });
    expect(allTexts(root)).toContain('使う筋肉');

    act(() => {
      findButtonByLabel(root, '記録')!.props.onPress();
    });
    expect(allTexts(root)).not.toContain('使う筋肉');
  });

  test('解説タブに呼吸法セクションは無い（2026-07-28のデザイン確定で削除）', () => {
    mockUseExercise.mockReturnValue(presetExercise());

    const root = render();
    const texts = allTexts(root);
    // ガイド自体は出ているのに呼吸法だけ消えていることを確かめる
    expect(texts).toContain('よくあるミス');
    expect(texts).not.toContain('呼吸法');
  });
});

describe('記録タブ: 記録0件／1件のとき', () => {
  const presetExercise = () => ({
    exercise: makeExercise({ source: 'preset', slug: 'bench_press' }),
    loaded: true,
  });
  const unit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' as const };
  const makePoint = (index: number, weight: number) => {
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
    const dateKey = new Date(2026, 6, 1 + index * 7).getTime();
    return { dateKey, startedAt: dateKey, value: weight, best: set, sets: [set] };
  };
  const withPoints = (weights: number[]) => {
    const series = { unit, points: weights.map((w, i) => makePoint(i, w)) };
    mockUseExerciseProgress.mockReturnValue({
      series,
      bestSeries: series,
      recordDays: series.points,
      chartMeasurementType: 'weight_reps',
      metric: 'best',
      loaded: true,
      failed: false,
    });
  };

  test('0件のときは見本グラフと「1回目を記録する」を出す', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 1, loaded: true });
    withPoints([]);

    const texts = allTexts(render());
    expect(texts).toContain('記録の推移がここに出ます');
    expect(texts).toContain('まずは今日の1回を記録しましょう');
    expect(texts).toContain('1回目を記録する');
  });

  test('「1回目を記録する」でその種目だけのセッションを作り、記録画面へ遷移する', async () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 1, loaded: true });
    withPoints([]);

    const root = render();
    await act(async () => {
      findButtonByLabel(root, '1回目を記録する')!.props.onPress();
    });

    expect(mockStartWorkoutWithExercise).toHaveBeenCalledWith(1);
    expect(mockPush).toHaveBeenCalledWith('/workout/1');
  });

  test('1件のときは過去の記録一覧を出さない（真上の内訳カードと同じ内容になるため）', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 1, loaded: true });
    withPoints([60]);

    const texts = allTexts(render());
    expect(texts).not.toContain('過去の記録');
    expect(texts).not.toContain('1回目を記録する');
  });

  test('2件以上なら記録ボタンを出さず、過去の記録一覧が出る', () => {
    mockUseExercise.mockReturnValue(presetExercise());
    mockUseExerciseRecordCount.mockReturnValue({ count: 2, loaded: true });
    withPoints([60, 65]);

    const texts = allTexts(render());
    expect(texts).not.toContain('1回目を記録する');
    expect(texts).toContain('過去の記録');
  });
});

describe('⋮メニュー: YouTubeで検索', () => {
  test('メニューから、下部ボタンと同じ検索URLでブラウザを開く', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'preset', slug: 'bench_press' }),
      loaded: true,
    });

    const root = render();
    act(() => {
      findButtonByLabel(root, '種目のメニューを開く')!.props.onPress();
    });
    // メニューが閉じるとModalはnullを返すため、開いている間に掴んでおく
    const modal = root.findByType(Modal);

    act(() => {
      findButtonByLabel(root, 'YouTubeで検索')!.props.onPress();
    });
    // Modalのdismiss完了前にブラウザをpresentすると画面が固まるため、まだ開かない
    expect(openBrowserAsync).not.toHaveBeenCalled();

    act(() => {
      modal.props.onDismiss();
    });
    expect(openBrowserAsync).toHaveBeenCalledWith(
      getYoutubeSearchUrl('ベンチプレス'),
      expect.anything(),
    );
  });

  test('編集はメニューを閉じた時点で即座に実行される（遅延はブラウザを開く項目だけ）', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom' }),
      loaded: true,
    });

    const root = render();
    act(() => {
      findButtonByLabel(root, '種目のメニューを開く')!.props.onPress();
    });
    act(() => {
      findButtonByLabel(root, '編集')!.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/exercise/edit/1');
  });
});
