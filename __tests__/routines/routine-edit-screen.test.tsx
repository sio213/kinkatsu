const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUpdateRoutine = jest.fn();
const mockGetRoutineDetail = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // RoutineFormはキーボードを閉じるためだけにuseFocusEffectを使う(setValue等の状態更新は
  // 無いので、exercise-picker-screen.test.tsxと同じ「毎レンダーで即実行」の単純なモックで安全)
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => ({ updateRoutine: mockUpdateRoutine }),
}));

jest.mock('@/lib/routines/db', () => ({
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
}));

// RoutineFormのリマインダーセクションが起動時に通知許可状態を確認するため、
// このテストでは常に許可済み(バナー非表示)を返しておく
jest.mock('@/lib/notifications/permissions', () => ({
  getPermissionState: async () => 'granted',
  ensurePermission: async () => 'granted',
}));

import type { RoutineDetail } from '@/lib/routines/db';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import RoutineEditScreen from '@/app/routine/edit/[id]';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity } from 'react-native';

function makeDetail(overrides: Partial<RoutineDetail> = {}): RoutineDetail {
  return {
    routine: { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0 },
    exercises: [
      {
        id: 10,
        routineId: 1,
        exerciseId: 5,
        orderIndex: 0,
        createdAt: 0,
        name: 'ベンチプレス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: 'bench_press',
        sets: [
          { id: 100, routineExerciseId: 10, setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, createdAt: 0 },
        ],
      },
    ],
    reminder: null,
    ...overrides,
  };
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

let currentInstance: ReturnType<typeof create> | undefined;

function render() {
  act(() => {
    currentInstance = create(React.createElement(RoutineEditScreen));
  });
  return currentInstance!.root;
}

// getRoutineDetailの非同期解決を流し込んでから状態を確認する（session-history-load-screen.test.tsxと同じ方針）
async function renderResolved() {
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRoutineDraftStore.getState().reset();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockUpdateRoutine.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

test('取得中はActivityIndicatorが表示される', () => {
  mockGetRoutineDetail.mockReturnValue(new Promise(() => {})); // 永久pending
  const root = render();
  expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);
});

test('取得成功: 名前・種目一覧がフォームに反映される', async () => {
  mockGetRoutineDetail.mockResolvedValue(makeDetail());
  const root = await renderResolved();

  const nameInput = root.findAllByType(TextInput)[0];
  expect(nameInput.props.value).toBe('胸の日');
  expect(root.findByProps({ accessibilityLabel: 'ベンチプレス、胸、1セット・60kg×8' })).toBeDefined();
});

test('リマインダー未設定(紐づくreminder行が無い)の既存ルーティンを編集すると、通知トグルはOFFで表示される(バグ回帰防止: OFFで保存→次に開くとONになっていた不具合)', async () => {
  // routineFormSchemaのrefineにより、ON+未設定のまま保存されることは無いため、
  // reminderが無い既存ルーティンは必ず直前にOFFで保存された結果のはず
  mockGetRoutineDetail.mockResolvedValue(makeDetail({ reminder: null }));
  const root = await renderResolved();

  const toggle = root.findByProps({ accessibilityLabel: '通知する' });
  expect(toggle.props.value).toBe(false);
});

test('種目0件のルーティンを編集すると空状態(種目を追加)が表示される', async () => {
  mockGetRoutineDetail.mockResolvedValue(makeDetail({ exercises: [] }));
  const root = await renderResolved();

  expect(root.findByProps({ accessibilityLabel: '種目を追加' })).toBeDefined();
});

test('idが不正(NaN)なら取得を試みず「見つかりません」になる', async () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  const root = await renderResolved();

  expect(mockGetRoutineDetail).not.toHaveBeenCalled();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
});

test('getRoutineDetailがnullを返す(削除済み)場合は「見つかりません」になる', async () => {
  mockGetRoutineDetail.mockResolvedValue(null);
  const root = await renderResolved();

  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
});

test('getRoutineDetailが失敗した場合はエラー表示になる（画面が白紙のまま固まらない）', async () => {
  mockGetRoutineDetail.mockRejectedValue(new Error('db error'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = await renderResolved();

  expect(root.findByProps({ children: 'ルーティンの読み込みに失敗しました' })).toBeDefined();
});

test('「見つかりません」画面の「戻る」を押すとrouter.backが呼ばれる', async () => {
  mockGetRoutineDetail.mockResolvedValue(null);
  const root = await renderResolved();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('保存すると updateRoutine(id, RoutineInput) が呼ばれ router.back する', async () => {
  // リマインダーが無いルーティンはhydrate時点でトグルOFFになる(toDraftReminderの既定)ため、
  // 何も操作せずそのまま保存できる
  mockGetRoutineDetail.mockResolvedValue(makeDetail());
  const root = await renderResolved();

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockUpdateRoutine).toHaveBeenCalledWith(
    1,
    {
      name: '胸の日',
      exercises: [{ exerciseId: 5, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] }],
    },
    { enabled: false, input: null },
  );
  expect(mockBack).toHaveBeenCalled();
});

test('保存に失敗するとAlertが表示され、router.backは呼ばれない', async () => {
  mockGetRoutineDetail.mockResolvedValue(makeDetail());
  mockUpdateRoutine.mockRejectedValueOnce(new Error('update failed'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = await renderResolved();

  const submitBtn = findButtonByLabel(root, '保存')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'ルーティンの保存に失敗しました。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('種目を追加ボタンを押すと/routine/exercise-pickerへ遷移する', async () => {
  mockGetRoutineDetail.mockResolvedValue(makeDetail());
  const root = await renderResolved();

  const addBtn = root.findByProps({ accessibilityLabel: '種目を追加' });
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/exercise-picker');
});

test('種目行をタップするとテンプレートセット編集画面へ、タップした種目のindexがfocusIndexとして渡される', async () => {
  mockGetRoutineDetail.mockResolvedValue(
    makeDetail({
      exercises: [
        ...makeDetail().exercises,
        {
          id: 11,
          routineId: 1,
          exerciseId: 6,
          orderIndex: 1,
          createdAt: 0,
          name: 'スクワット',
          category: 'leg',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'squat',
          sets: [
            { id: 101, routineExerciseId: 11, setNumber: 1, weight: 80, reps: 5, durationSeconds: null, distanceMeters: null, createdAt: 0 },
          ],
        },
      ],
    }),
  );
  const root = await renderResolved();

  const row = root.findByProps({ accessibilityLabel: 'スクワット、脚、1セット・80kg×5' });
  act(() => {
    row.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/routine/exercise-edit',
    params: { focusIndex: '1' },
  });
});

describe('リマインダーセクション: 既存ルーティンからのhydrate', () => {
  test('ON+設定済みのリマインダーが紐づいていれば、フォームに概要が反映され無変更保存でも維持される', async () => {
    mockGetRoutineDetail.mockResolvedValue(
      makeDetail({
        reminder: {
          id: 1,
          routineId: 1,
          title: '胸の日',
          body: 'b',
          kind: 'weekly',
          hour: 7,
          minute: 0,
          weekdays: '[1,3]',
          monthdays: null,
          anchorDate: null,
          intervalDays: 7,
          intervalMonths: null,
          nthWeek: null,
          nthWeekdays: null,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
      }),
    );
    const root = await renderResolved();

    const reminderBox = root
      .findAllByType(TouchableOpacity)
      .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.includes('タップして変更'));
    expect(reminderBox).toBeDefined();

    const submitBtn = findButtonByLabel(root, '保存')!;
    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(mockUpdateRoutine).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: '胸の日' }),
      { enabled: true, input: expect.objectContaining({ kind: 'weekly', weekdays: [1, 3] }) },
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('OFF+設定済みのリマインダーが紐づいていれば、無変更保存でもバリデーションエラーにならない', async () => {
    mockGetRoutineDetail.mockResolvedValue(
      makeDetail({
        reminder: {
          id: 1,
          routineId: 1,
          title: '胸の日',
          body: 'b',
          kind: 'interval',
          hour: 18,
          minute: 0,
          weekdays: null,
          monthdays: null,
          anchorDate: null,
          intervalDays: 1,
          intervalMonths: null,
          nthWeek: null,
          nthWeekdays: null,
          enabled: false,
          createdAt: 0,
          updatedAt: 0,
        },
      }),
    );
    const root = await renderResolved();

    const submitBtn = findButtonByLabel(root, '保存')!;
    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(mockUpdateRoutine).toHaveBeenCalledWith(
      1,
      expect.anything(),
      { enabled: false, input: expect.objectContaining({ kind: 'interval' }) },
    );
    expect(mockBack).toHaveBeenCalled();
  });
});
