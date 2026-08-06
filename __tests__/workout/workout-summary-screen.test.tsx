const mockDismissAll = jest.fn();
const mockPush = jest.fn();
// Stack.Screenに渡されたoptions（headerLeft・gestureEnabled）を検証するために取っておく
let capturedOptions: Record<string, any> = {};
// HeaderMenuに渡されたgroups（⋮の項目）
let capturedMenuGroups: any[][] = [];
const mockUseLocalSearchParams = jest.fn();
const mockUseWorkoutSession = jest.fn();
const mockUseSessionTotal = jest.fn();
const mockUseSessionWeekOrdinal = jest.fn();
const mockUseSessionExerciseCards = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerTitle（タイトル＋日付サブタイトル）をテストで検証できるようレンダー関数だけ実行する
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown; headerRight?: () => unknown } }) => {
      const { createElement, Fragment } = require('react');
      capturedOptions = (options ?? {}) as Record<string, any>;
      return createElement(Fragment, null, options?.headerTitle?.(), options?.headerRight?.());
    },
  },
}));

// HeaderMenuは中身（項目のkey/label/onPress）だけ検証すればよく、ドロップダウンの開閉は
// dropdown-menu側のテストの担当なので、groupsを取り出すだけのモックに差し替える
jest.mock('@/components/ui/dropdown-menu', () => ({
  HeaderMenu: ({ groups }: { groups: unknown[][] }) => {
    capturedMenuGroups = groups as any[][];
    return null;
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSession: (...args: unknown[]) => mockUseWorkoutSession(...args),
}));

// db/clientを経由してexpo-sqliteまで読み込まれるのを防ぐ（未モック環境では解決に失敗する）
jest.mock('@/hooks/use-session-summary', () => ({
  useSessionTotal: (...args: unknown[]) => mockUseSessionTotal(...args),
  useSessionWeekOrdinal: (...args: unknown[]) => mockUseSessionWeekOrdinal(...args),
}));

// グラフは専用のテストで検証済み。ここでは渡している種目だけを見たいのでラベルに置き換える
jest.mock('@/components/workout/summary-exercise-chart', () => ({
  SummaryExerciseChart: ({ exercises }: { exercises: { name: string }[] }) => {
    const { Text } = require('react-native');
    const { createElement } = require('react');
    return createElement(Text, null, `グラフ:${exercises.map((e) => e.name).join(',')}`);
  },
}));

jest.mock('@/hooks/use-session-exercise-cards', () => ({
  useSessionExerciseCards: (...args: unknown[]) => mockUseSessionExerciseCards(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import WorkoutSummaryScreen from '@/app/workout/summary/[id]';
import { PLACEHOLDER_COMMUNITY_MESSAGE } from '@/lib/workout/community-message';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

/** レンダーされたTextの文字列（入れ子のTextは別要素として拾う）。propsの形に依存させないため */
function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) =>
      [t.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''),
    )
    .filter((s) => s.length > 0);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(WorkoutSummaryScreen));
  });
  return instance.root;
}

function exerciseCard({
  workoutSessionExerciseId,
  name,
  completed,
  exerciseId,
  measurementType,
  sets,
}: {
  workoutSessionExerciseId: number;
  name: string;
  completed: boolean;
  exerciseId?: number;
  measurementType?: string;
  sets?: {
    setNumber: number;
    weight: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    completedAt: number | null;
  }[];
}) {
  return {
    workoutSessionExerciseId,
    exerciseId: exerciseId ?? workoutSessionExerciseId,
    name,
    category: 'chest',
    measurementType: measurementType ?? 'weight_reps',
    source: 'preset',
    slug: null,
    pairedWeights: false,
    sets: sets ?? [
      {
        setNumber: 1,
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: completed ? 1 : null,
      },
    ],
    sessionId: 1,
    sessionStartedAt: 0,
    isBest: false,
    comparison: null,
  };
}

const FIXED_START = new Date(2026, 7, 1, 19, 30, 0).getTime();
const session = { id: 1, startedAt: FIXED_START, endedAt: FIXED_START + 72 * 60_000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockUseWorkoutSession.mockReturnValue({ session, loaded: true });
  mockUseSessionTotal.mockReturnValue({ total: { label: '総重量', value: '12,450', unit: 'kg' } });
  mockUseSessionWeekOrdinal.mockReturnValue(2);
  mockUseSessionExerciseCards.mockReturnValue({ cards: [], retry: jest.fn() });
});

test('ヘッダーにタイトルとセッションの日付を表示する', () => {
  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['トレーニング完了', '8月1日（土）']));
});

test('数値3項目に所要時間・主役数値・今週N回目を表示する', () => {
  const root = render();

  // 72分は「1時間12分」に折り返す（formatSessionDurationLong）
  expect(texts(root)).toEqual(
    expect.arrayContaining(['時間', '1時間12分', '総重量', '12,450', 'kg', '今週', '2', '回目']),
  );
});

// セッションの中身によって2項目目の呼び名と単位が変わる（重量種目が無ければ合計回数など）
test('主役数値のラベルと単位はフックが返したものをそのまま出す', () => {
  mockUseSessionTotal.mockReturnValue({ total: { label: '合計回数', value: '84', unit: '回' } });

  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['合計回数', '84', '回']));
});

test('主役数値が組み立てられない場合はダッシュを出す', () => {
  mockUseSessionTotal.mockReturnValue({ total: null });

  const root = render();

  expect(texts(root)).toContain('—');
});

// 未解決（undefined）で「—」や「0回目」を描くと、開くたびに一瞬それが見えてから実値に切り替わる。
// 終了直後のセッションが「今週0回目」になることは論理的にありえない
test('集計が未解決のうちはダッシュも0回目も描かない', () => {
  mockUseSessionTotal.mockReturnValue({ total: undefined });
  mockUseSessionWeekOrdinal.mockReturnValue(undefined);

  const root = render();

  expect(texts(root)).not.toContain('—');
  expect(texts(root)).not.toContain('0');
  // 所要時間はセッションから直接出せるので、未解決でも表示されている
  expect(texts(root)).toContain('1時間12分');
});

// ラベルと数値が別々の要素として読まれると対応が付かない
test('数値3項目はセル単位で1つの読み上げにまとまる', () => {
  const root = render();

  const labels = root
    .findAllByProps({ accessible: true })
    .map((n: ReactTestInstance) => n.props.accessibilityLabel)
    .filter((l: unknown): l is string => typeof l === 'string');
  expect(labels).toEqual(
    expect.arrayContaining(['時間 1時間12分', '総重量 12,450kg', '今週 2回目']),
  );
});

// 戻る先が無い画面なので、シェブロンもスワイプバックも持たせない。離脱は「閉じる」に一本化する
test('戻る導線を持たない（ヘッダーのシェブロンもスワイプバックも無し）', () => {
  render();

  expect(capturedOptions.headerLeft?.({})).toBeNull();
  // headerLeftを空にするだけではネイティブの戻るボタンが残る（実機で確認）
  expect(capturedOptions.headerBackVisible).toBe(false);
  expect(capturedOptions.gestureEnabled).toBe(false);
});

// popにすると記録編集へ降りた時点でサマリーがスタックから消え、記録編集の「完了」がタブまで抜ける
test('⋮の「記録を編集」は記録編集画面をpushする（popではない）', () => {
  render();

  const items = capturedMenuGroups.flat();
  const edit = items.find((i: any) => i.key === 'edit');
  expect(edit.label).toBe('記録を編集');
  act(() => {
    edit.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/workout/1');
});

// 投稿・抽選の仕組みが入るまでは固定の1件を出す。文言そのものはプレースホルダー側の
// 責務なので、画面テストは中身に依存させずマウントされていることだけを見る
test('みんなの声を表示する', () => {
  const root = render();

  expect(texts(root)).toContain(PLACEHOLDER_COMMUNITY_MESSAGE.author);
});

// ✓が付いていない種目も並べる（@ユーザー指摘）。実施していないことはカード自身が
// 「0セット」と示すため、一覧から消して見えなくする必要がない
test('✓が1つも付いていない種目も一覧に並べる', () => {
  const performed = exerciseCard({ workoutSessionExerciseId: 1, name: 'ベンチプレス', completed: true });
  const untouched = exerciseCard({ workoutSessionExerciseId: 2, name: 'ディップス', completed: false });
  mockUseSessionExerciseCards.mockReturnValue({ cards: [performed, untouched], retry: jest.fn() });

  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['ベンチプレス', 'ディップス', '全2件']));
});

// 同じ種目を2枚追加している場合（ウォームアップ＋本番）、カードは2件でも描くグラフは同じ
test('グラフに渡す種目は種目idで重複を畳む', () => {
  mockUseSessionExerciseCards.mockReturnValue({
    cards: [
      exerciseCard({ workoutSessionExerciseId: 1, name: 'ベンチプレス', completed: true }),
      exerciseCard({ workoutSessionExerciseId: 2, name: 'ベンチプレス', completed: true, exerciseId: 1 }),
      exerciseCard({ workoutSessionExerciseId: 3, name: 'ディップス', completed: true }),
    ],
    retry: jest.fn(),
  });

  const root = render();

  expect(texts(root)).toContain('グラフ:ベンチプレス,ディップス');
});

test('「閉じる」を押すとrouter.dismissAllで元いたタブまで畳む', () => {
  const root = render();

  act(() => {
    findButtonByLabel(root, '閉じる')!.props.onPress();
  });

  expect(mockDismissAll).toHaveBeenCalled();
});

// 記録編集画面の⋮「削除」は deleteSession → router.back() なので、サマリーから開いていると
// 削除済みセッションのサマリーへ戻ってくる。そのまま留まらせず即座に畳む
test('セッションが削除されている場合はそのままタブまで畳む', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: true });

  render();

  expect(mockDismissAll).toHaveBeenCalled();
});

// useWorkoutSessionのdataは解決前から[]なので、loadedを見ないとマウント直後に必ず畳んでしまう
test('読み込み中（loaded=false）はまだ畳まない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });

  render();

  expect(mockDismissAll).not.toHaveBeenCalled();
});

test('idが数値でない場合もタブまで畳む', () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });

  render();

  expect(mockDismissAll).toHaveBeenCalled();
});

// このトレーニングの種目構成をルーティン化する導線。保存自体はここでは行わず、
// ルーティン新規作成フォームに種目を積んだ状態で着地させる
describe('⋮の「ルーティンとして保存」', () => {
  const cards = [
    exerciseCard({ workoutSessionExerciseId: 1, name: 'ベンチプレス', completed: true }),
    // ✓が付いていない種目も持ち込む（ルーティンは実績ではなく「これから毎回やる型」のため）
    exerciseCard({ workoutSessionExerciseId: 2, name: 'ディップス', completed: false, exerciseId: 7 }),
  ];

  function menuItem() {
    return capturedMenuGroups.flat().find((i: any) => i.key === 'save-routine');
  }

  beforeEach(() => {
    useRoutineDraftStore.getState().reset();
    mockUseSessionExerciseCards.mockReturnValue({ cards, retry: jest.fn() });
  });

  test('フリー開始のセッションでは⋮に項目が出る', () => {
    render();

    expect(menuItem()?.label).toBe('ルーティンとして保存');
  });

  // ルーティンから始めたセッションで出すと、同じ内容のルーティンが二重にできる
  // （そちらは「ルーティンを更新」として別途扱う）
  test('ルーティンから開始したセッションでは項目を出さない', () => {
    mockUseWorkoutSession.mockReturnValue({ session: { ...session, routineId: 5 }, loaded: true });

    render();

    expect(menuItem()).toBeUndefined();
  });

  // cardsは null=読み込み中 / 'error'=取得失敗 / 配列 の三値
  test('カードが読み込み中・取得失敗・0件のときは項目を出さない', () => {
    mockUseSessionExerciseCards.mockReturnValue({ cards: null, retry: jest.fn() });
    render();
    expect(menuItem()).toBeUndefined();

    mockUseSessionExerciseCards.mockReturnValue({ cards: 'error', retry: jest.fn() });
    render();
    expect(menuItem()).toBeUndefined();

    mockUseSessionExerciseCards.mockReturnValue({ cards: [], retry: jest.fn() });
    render();
    expect(menuItem()).toBeUndefined();
  });

  test('押すと下書きに全種目を積み、keepDraftとルーティン名つきで/routine/newへpushする', () => {
    render();

    act(() => {
      menuItem().onPress();
    });

    // 表示用フィールドとセット値まで丸ごと積む（種目idだけ見ていると
    // categoryとsourceの取り違えのような写し間違いを検知できない）
    expect(useRoutineDraftStore.getState().exercises).toEqual([
      {
        exerciseId: 1,
        name: 'ベンチプレス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: null,
        sets: [{ weight: 100, reps: 5, durationSeconds: null, distanceMeters: null }],
      },
      {
        exerciseId: 7,
        name: 'ディップス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: null,
        // ✓が付いていなくても、値が入っているセットはそのまま持ち込む
        sets: [{ weight: 100, reps: 5, durationSeconds: null, distanceMeters: null }],
      },
    ]);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/routine/new',
      params: { keepDraft: '1', name: '胸の日' },
    });
  });

  // グラフ(toChartExercises)は同じ種目の2枚目を畳むが、ルーティン化では畳まない。
  // ウォームアップ用と本番用でカードを分けている構成をそのまま型にするため
  test('同じ種目のカードが2枚あるセッションは2枚のまま積む', () => {
    mockUseSessionExerciseCards.mockReturnValue({
      cards: [
        exerciseCard({ workoutSessionExerciseId: 1, name: 'ベンチプレス', completed: true, exerciseId: 3 }),
        exerciseCard({ workoutSessionExerciseId: 2, name: 'ベンチプレス', completed: true, exerciseId: 3 }),
      ],
      retry: jest.fn(),
    });

    render();
    act(() => {
      menuItem().onPress();
    });

    expect(useRoutineDraftStore.getState().exercises.map((e) => e.exerciseId)).toEqual([3, 3]);
  });

  // 種目を追加しただけで実施せずに終えたカード。0セットのまま保存できると
  // ルーティンの種目行が「0セット」表示になるため、空1セットに落とす
  test('値が1つも入っていない種目は空1セットとして積む', () => {
    mockUseSessionExerciseCards.mockReturnValue({
      cards: [
        exerciseCard({
          workoutSessionExerciseId: 1,
          name: 'ディップス',
          completed: false,
          sets: [
            { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null, completedAt: null },
          ],
        }),
      ],
      retry: jest.fn(),
    });

    render();
    act(() => {
      menuItem().onPress();
    });

    expect(useRoutineDraftStore.getState().exercises[0].sets).toEqual([
      { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
  });

  // weight_reps以外の計測タイプでも、埋まっているカラムだけが下書きへ渡る
  test('時間で計測する種目はdurationSecondsのまま積む', () => {
    mockUseSessionExerciseCards.mockReturnValue({
      cards: [
        exerciseCard({
          workoutSessionExerciseId: 1,
          name: 'プランク',
          completed: true,
          measurementType: 'time',
          sets: [
            { setNumber: 1, weight: null, reps: null, durationSeconds: 60, distanceMeters: null, completedAt: 1 },
          ],
        }),
      ],
      retry: jest.fn(),
    });

    render();
    act(() => {
      menuItem().onPress();
    });

    expect(useRoutineDraftStore.getState().exercises[0].sets).toEqual([
      { weight: null, reps: null, durationSeconds: 60, distanceMeters: null },
    ]);
  });

  // hydrateは種目しか差し替えないため、resetを挟まないと「以前ルーティンを作りかけて
  // やめたときのリマインダー設定」を引き継いだ状態で新規作成フォームに着地する
  test('前の下書きのリマインダー設定を引き継がない', () => {
    act(() => {
      useRoutineDraftStore.getState().setReminderEnabled(false);
    });

    render();
    act(() => {
      menuItem().onPress();
    });

    expect(useRoutineDraftStore.getState().reminderEnabled).toBe(true);
  });
});
