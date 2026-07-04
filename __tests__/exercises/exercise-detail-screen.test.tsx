const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseExercise = jest.fn();
const mockToggleFavorite = jest.fn();
const mockRemoveExercise = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: '1' }),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（⋮ボタン）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 64,
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercise: (...args: unknown[]) => mockUseExercise(...args),
  useExercises: () => ({
    toggleFavorite: mockToggleFavorite,
    removeExercise: mockRemoveExercise,
  }),
}));

jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({}),
  VideoView: 'VideoView',
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
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
    muscle: null,
    formPoints: null,
    source: 'custom',
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

describe('⋮メニュー: 削除はカスタム種目のみ表示', () => {
  test('source=customのとき削除メニューが表示される', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ source: 'custom' }),
      loaded: true,
    });

    const root = render();
    const menuBtn = findButtonByLabel(root, 'メニューを開く')!;
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
    const menuBtn = findButtonByLabel(root, 'メニューを開く')!;
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
    const menuBtn = findButtonByLabel(root, 'メニューを開く')!;
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
