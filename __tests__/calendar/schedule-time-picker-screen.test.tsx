const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockCreateScheduledWorkout = jest.fn();
const mockCreateDirectScheduledWorkout = jest.fn();
const mockCreateHistoryScheduledWorkout = jest.fn();
const mockEnsurePermission = jest.fn();
let mockExercises: { id: number; name: string }[];

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/lib/notifications/scheduled-workout-scheduler', () => ({
  createScheduledWorkout: (...args: unknown[]) => mockCreateScheduledWorkout(...args),
  createDirectScheduledWorkout: (...args: unknown[]) => mockCreateDirectScheduledWorkout(...args),
  createHistoryScheduledWorkout: (...args: unknown[]) => mockCreateHistoryScheduledWorkout(...args),
}));

// 直接追加モード（exerciseIdsパラメータ、2026-07-20）のタイトル合成に使う。このテストファイルは
// ルーティンモードが主眼のため、直接モードのテストで使う最小限の種目だけ用意する
jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => ({ exercises: mockExercises }),
}));

// usePermissionState(hooks/use-permission-state.ts)はgetPermissionStateだけを使うが、
// handleConfirm/handleRequestPermissionはensurePermissionを使うため両方モックする。
// テスト内では権限状態を区別する必要が無い限り同じ返り値でよい
jest.mock('@/lib/notifications/permissions', () => ({
  ensurePermission: (...args: unknown[]) => mockEnsurePermission(...args),
  getPermissionState: (...args: unknown[]) => mockEnsurePermission(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Platform, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Switch } from '@/components/ui/switch';
import ScheduleTimePickerScreen from '@/app/calendar/schedule-time-picker';

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === label);
}

// この画面は usePermissionState 経由で AppState のリスナーを張るため、アンマウントしないまま
// テストを終えるとリスナーが残り、Jest環境の破棄後にタイマーが発火して worker ごと落ちる
// （カバレッジ計測で処理が遅くなると顕在化する）。作ったインスタンスを控えて必ず片付ける
const mountedInstances: ReturnType<typeof create>[] = [];

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleTimePickerScreen));
  });
  mountedInstances.push(instance);
  return instance.root;
}

afterEach(() => {
  act(() => {
    for (const instance of mountedInstances) instance.unmount();
  });
  mountedInstances.length = 0;
});

async function renderAndSettle() {
  const root = render();
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: '10', routineName: '胸の日' });
  mockCreateScheduledWorkout.mockResolvedValue(1);
  mockCreateDirectScheduledWorkout.mockResolvedValue(1);
  mockCreateHistoryScheduledWorkout.mockResolvedValue(1);
  mockEnsurePermission.mockResolvedValue('granted');
  mockExercises = [];
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('ヘッダーはタイトル「時刻を設定」、サブタイトルは日付のみを表示する（画面1のタイトル=アクション名/サブタイトル=日付という階層に合わせる。予定名は前画面で選んだばかりのため表示しない、2026-07-22@ユーザー指摘）', () => {
  const root = render();
  expect(root.findByProps({ children: '時刻を設定' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('デフォルト時刻は18:00（iOSは常時インラインspinnerのDateTimePickerの初期値で確認する）', () => {
  const root = render();
  const picker = root.findByType(DateTimePicker);
  const value: Date = picker.props.value;
  expect(value.getHours()).toBe(18);
  expect(value.getMinutes()).toBe(0);
});

test('確定を押すとcreateScheduledWorkoutにroutineId/routineName/dateKey/hour/minuteを渡し、成功後router.dismiss(3)する（calendar→schedule-chooser→schedule-routine-picker→この画面の3階層分、2026-07-20）', async () => {
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0, true);
  expect(mockDismiss).toHaveBeenCalledWith(3);
  // ルーティン予定も直接追加と同じく、作成直後にそのまま目標セット編集画面へpushする（PR7で統一）
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-workout-edit',
    params: { scheduledWorkoutId: '1' },
  });
  // dismissしてからpushする順序が入れ替わらないことを固定する（@tester指摘）
  const dismissOrder = mockDismiss.mock.invocationCallOrder[0];
  const pushOrder = mockPush.mock.invocationCallOrder[0];
  expect(dismissOrder).toBeLessThan(pushOrder);
});

test('確定を押すと先にensurePermissionを呼ぶ（通知が届くよう権限をリクエストしておく）', async () => {
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockEnsurePermission).toHaveBeenCalled();
});

test('ensurePermission自体が例外を投げても(拒否ではなくAPI呼び出し失敗)、握りつぶしてcreateScheduledWorkoutへ進み、予定は保存される（自動レビュー指摘: 「権限が無くても保存は続ける」方針をこの経路でも守る）', async () => {
  // usePermissionState(マウント時)とhandleConfirm内のensurePermissionは同じmockEnsurePermissionを
  // 共有するため、マウント(1回目の呼び出し)を先に正常終了させてから、確定時(2回目)だけ
  // rejectさせる
  const root = render();
  await act(async () => {
    await Promise.resolve();
  });
  mockEnsurePermission.mockRejectedValueOnce(new Error('permission api error'));
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0, true);
  expect(mockDismiss).toHaveBeenCalledWith(3);
  expect(Alert.alert).not.toHaveBeenCalledWith('エラー', expect.anything());
});

test('権限が拒否/未許可でもcreateScheduledWorkoutは呼ばれ、予定自体は保存される（通知はスキップするだけで予定作成は止めない方針）', async () => {
  mockEnsurePermission.mockResolvedValue('denied');
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0, true);
  expect(mockDismiss).toHaveBeenCalledWith(3);
});

test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
  mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を追加できませんでした。');
  expect(mockDismiss).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test('連打してもcreateScheduledWorkoutは1回しか呼ばれない（isSubmittingRefによる二重送信防止）', async () => {
  let resolveAdd!: (v: number) => void;
  mockCreateScheduledWorkout.mockReturnValue(
    new Promise((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    submitBtn.props.onPress();
    // isSubmittingRefのガード自体はensurePermission呼び出し前の同期処理で効くが、
    // createScheduledWorkoutの呼び出しはensurePermissionのawaitを挟むため、
    // マイクロタスクを進めてから呼び出し回数を確認する
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd(1);
  });
});

test('確定処理中はボタンがdisabledになり、完了後は解除される（ensurePermissionのOS応答待ちで無反応に見えないための視覚フィードバック）', async () => {
  let resolvePermission!: (v: string) => void;
  mockEnsurePermission.mockReturnValue(
    new Promise((resolve) => {
      resolvePermission = resolve;
    }),
  );
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  expect(submitBtn.props.disabled).toBe(false);

  act(() => {
    submitBtn.props.onPress();
  });
  expect(findByLabel(root, 'この時刻で予定を追加')!.props.disabled).toBe(true);

  await act(async () => {
    resolvePermission('granted');
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(findByLabel(root, 'この時刻で予定を追加')!.props.disabled).toBe(false);
});

test('選択日が今日で、既に過ぎた時刻のまま確定してもAlertを出さず、そのままdismiss+pushする（2026-07-22、過去時刻の警告Alertは不要とのユーザー指摘で削除）', async () => {
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  mockUseLocalSearchParams.mockReturnValue({ dateKey, routineId: '10', routineName: '胸の日' });
  mockCreateScheduledWorkout.mockResolvedValueOnce(42);
  const root = render();
  const picker = root.findByType(DateTimePicker);
  const pastTime = new Date(today.getTime() - 60 * 60 * 1000); // 1時間前
  act(() => {
    picker.props.onChange({}, pastTime);
  });
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', dateKey, pastTime.getHours(), pastTime.getMinutes(), true);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockDismiss).toHaveBeenCalledWith(3);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/calendar/schedule-workout-edit',
    params: { scheduledWorkoutId: '42' },
  });
});

test('失敗後はisSubmittingRefが解除され、再度確定を押すと再度呼べる', async () => {
  mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  mockCreateScheduledWorkout.mockResolvedValueOnce(2);
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledTimes(2);
  expect(mockDismiss).toHaveBeenCalledWith(3);
});

test.each([
  ['abc(NaN)', 'abc'],
  ['空文字', ''],
  ['"0"', '0'],
  ['負数', '-1'],
  ['小数', '1.5'],
])('routineIdが不正(%s)な場合は「見つかりません」画面になり、createScheduledWorkoutは呼ばれない', (_label, routineId) => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId, routineName: '胸の日' });
  const root = render();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  expect(() => findByLabel(root, 'この時刻で予定を追加')).not.toThrow();
  expect(findByLabel(root, 'この時刻で予定を追加')).toBeUndefined();
});

test('routineIdが正の整数の文字列であれば通常表示になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: '10', routineName: '胸の日' });
  const root = render();
  expect(findByLabel(root, 'この時刻で予定を追加')).toBeDefined();
});

test('dateKeyが不正な形式の場合も「見つかりません」画面になり、createScheduledWorkoutは呼ばれない（parseDateKeyへ渡してクラッシュしないためのガード）', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: 'not-a-date', routineId: '10', routineName: '胸の日' });
  const root = render();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  expect(findByLabel(root, 'この時刻で予定を追加')).toBeUndefined();
});

test('dateKeyが無い(undefined)場合も「見つかりません」画面になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: undefined, routineId: '10', routineName: '胸の日' });
  const root = render();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
});

test('「見つかりません」画面の「戻る」を押すとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: 'abc', routineName: '胸の日' });
  const root = render();
  const backBtn = findByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('iOS: DateTimePickerのonChangeで時刻を変更すると、確定時にその時刻がcreateScheduledWorkoutへ渡る', async () => {
  const root = render();
  const picker = root.findByType(DateTimePicker);
  act(() => {
    picker.props.onChange({}, new Date(2000, 0, 1, 20, 15));
  });
  const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 20, 15, true);
});

describe('通知の権限バナー（PR10-5）', () => {
  test('権限がgrantedならバナーは出ない', async () => {
    mockEnsurePermission.mockResolvedValue('granted');
    const root = await renderAndSettle();
    expect(() => root.findByProps({ accessibilityLabel: '許可する' })).toThrow();
  });

  test('権限がundeterminedなら「許可する」バナーが出て、押すとensurePermissionが呼ばれる', async () => {
    mockEnsurePermission.mockResolvedValue('undetermined');
    const root = await renderAndSettle();
    const requestBtn = findByLabel(root, '許可する')!;
    expect(requestBtn).toBeDefined();

    mockEnsurePermission.mockClear();
    mockEnsurePermission.mockResolvedValue('granted');
    await act(async () => {
      requestBtn.props.onPress();
      await Promise.resolve();
    });
    expect(mockEnsurePermission).toHaveBeenCalled();
  });

  test('権限がdeniedなら「設定を開く」バナーが出る', async () => {
    mockEnsurePermission.mockResolvedValue('denied');
    const root = await renderAndSettle();
    expect(findByLabel(root, '設定を開く')).toBeDefined();
  });
});

// 予定単位の通知トグル（2026-07-22、@ユーザー指摘機能）。ルーティン編集フォームの通知トグルを
// 参考にした軽量版(components/calendar/schedule-notify-toggle.tsx)をこの画面に組み込む
describe('通知トグル', () => {
  test('デフォルトはON（うっかりOFFのまま通知が来ない事故を避けるため、@pm/@user-advisor指摘）', () => {
    const root = render();
    const toggle = root.findByProps({ accessibilityLabel: '通知する' });
    expect(toggle.props.value).toBe(true);
  });

  test('OFFにして確定すると、createScheduledWorkoutにnotifyEnabled:falseが渡る', async () => {
    const root = render();
    const toggle = root.findByType(Switch);
    act(() => {
      toggle.props.onValueChange(false);
    });
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0, false);
  });

  // トグルOFF＝この予定は通知しない、という意思表示なので、iOSの一度きりのネイティブ許可
  // ダイアログという貴重な機会を無関係にここで消費しないよう、ensurePermission自体を呼ばない
  // (@reviewer/@tester/@designer全員が独立して指摘した最重要ポイント)
  test('OFFにして確定すると、ensurePermissionは呼ばれない（通知する気が無い操作でOS許可ダイアログを出さない）', async () => {
    const root = render();
    const toggle = root.findByType(Switch);
    act(() => {
      toggle.props.onValueChange(false);
    });
    mockEnsurePermission.mockClear();
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockEnsurePermission).not.toHaveBeenCalled();
    expect(mockCreateScheduledWorkout).toHaveBeenCalled();
  });

  test('ONのまま確定すると、従来通りensurePermissionが呼ばれる（回帰確認）', async () => {
    const root = render();
    mockEnsurePermission.mockClear();
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockEnsurePermission).toHaveBeenCalled();
  });

  test('直接追加モードでOFFにして確定すると、createDirectScheduledWorkoutにnotifyEnabled:falseが渡る', async () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', exerciseIds: '1,2' });
    mockExercises = [
      { id: 1, name: 'ベンチプレス' },
      { id: 2, name: 'スクワット' },
    ];
    const root = render();
    const toggle = root.findByType(Switch);
    act(() => {
      toggle.props.onValueChange(false);
    });
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateDirectScheduledWorkout).toHaveBeenCalledWith(
      [1, 2],
      'ベンチプレス 他1種目',
      '2026-07-25',
      18,
      0,
      false,
    );
  });

  test('トグルをOFFにすると、権限が拒否されていても権限バナーは出ない（OFFの予定は通知しないため案内不要）', async () => {
    mockEnsurePermission.mockResolvedValue('denied');
    const root = await renderAndSettle();
    expect(findByLabel(root, '設定を開く')).toBeDefined();

    const toggle = root.findByType(Switch);
    act(() => {
      toggle.props.onValueChange(false);
    });
    expect(findByLabel(root, '設定を開く')).toBeUndefined();
  });
});

describe('直接追加モード（exerciseIdsパラメータ、schedule-exercise-picker経由、2026-07-20）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', exerciseIds: '1,2' });
    mockExercises = [
      { id: 1, name: 'ベンチプレス' },
      { id: 2, name: 'スクワット' },
    ];
  });

  test('直接追加モードでもヘッダーのサブタイトルは日付のみ（種目名は表示しない、ルーティンモードと同じ階層）', () => {
    const root = render();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  });

  test('確定を押すとcreateDirectScheduledWorkoutにexerciseIds/合成タイトル/dateKey/hour/minuteを渡し、createScheduledWorkoutは呼ばれない', async () => {
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateDirectScheduledWorkout).toHaveBeenCalledWith([1, 2], 'ベンチプレス 他1種目', '2026-07-25', 18, 0, true);
    expect(mockCreateScheduledWorkout).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith(3);
  });

  test('確定後、作成した予定の目標セット編集画面(schedule-workout-edit)へ遷移する（過去の記録から読み込むフローと同じく、作成直後にそのまま編集先へ連れて行く、@ユーザー指摘）', async () => {
    mockCreateDirectScheduledWorkout.mockResolvedValueOnce(42);
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockDismiss).toHaveBeenCalledWith(3);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-edit',
      params: { scheduledWorkoutId: '42' },
    });
    // dismissしてからpushする順序が入れ替わらないことを固定する
    const dismissOrder = mockDismiss.mock.invocationCallOrder[0];
    const pushOrder = mockPush.mock.invocationCallOrder[0];
    expect(dismissOrder).toBeLessThan(pushOrder);
  });

  test('過去時刻を選んでもAlertを出さず、そのままdismiss後に目標セット編集画面へpushする（2026-07-22、過去時刻の警告Alertは不要とのユーザー指摘で削除）', async () => {
    mockCreateDirectScheduledWorkout.mockResolvedValueOnce(42);
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockUseLocalSearchParams.mockReturnValue({ dateKey, exerciseIds: '1,2' });
    const root = render();
    const picker = root.findByType(DateTimePicker);
    const pastTime = new Date(today.getTime() - 60 * 60 * 1000); // 1時間前
    act(() => {
      picker.props.onChange({}, pastTime);
    });
    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith(3);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-edit',
      params: { scheduledWorkoutId: '42' },
    });
  });

  test('exerciseIdsに不正な値が1件でも混ざっていれば直接モードとして扱わず、ルーティン未指定と同じ「見つからない」表示になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', exerciseIds: '1,abc' });
    const root = render();
    expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  });

  test('routineIdとexerciseIdsのどちらも無い場合は「見つからない」表示になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25' });
    const root = render();
    expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  });
});

describe('Android', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  test('初期状態ではDateTimePickerは表示されず、時刻ボタンのみが見える', () => {
    const root = render();
    expect(() => root.findByType(DateTimePicker)).toThrow();
    expect(findByLabel(root, '時刻を変更')).toBeDefined();
  });

  test('時刻ボタンをタップするとDateTimePickerが表示され、選択すると閉じてhour/minuteが更新される', async () => {
    const root = render();
    const timeBtn = findByLabel(root, '時刻を変更')!;
    act(() => {
      timeBtn.props.onPress();
    });
    const picker = root.findByType(DateTimePicker);
    act(() => {
      picker.props.onChange({}, new Date(2000, 0, 1, 9, 45));
    });
    // Androidはピッカーからの選択後、再びボタンのみの表示に戻る
    expect(() => root.findByType(DateTimePicker)).toThrow();

    const submitBtn = findByLabel(root, 'この時刻で予定を追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 9, 45, true);
  });
});

// 「予定を追加」→「過去の記録」経路（2026-07-25新設）。画面3(schedule-workout-history-load)が
// 「種目id:元カードid」のペア列をhistorySelectionsとして渡してくる。予定は時刻を確定した
// この画面で初めて作られ、目標セットには選んだ過去カードそのものの値が入る
describe('過去の記録モード（historySelectionsパラメータ）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({
      dateKey: '2026-07-25',
      historySelections: '10:500,11:501',
    });
    mockExercises = [
      { id: 10, name: 'ベンチプレス' },
      { id: 11, name: 'ダンベルフライ' },
    ];
  });

  test('確定するとcreateHistoryScheduledWorkoutへ選択ペアと合成タイトルを渡す', async () => {
    const root = await renderAndSettle();
    await act(async () => {
      findByLabel(root, 'この時刻で予定を追加')!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateHistoryScheduledWorkout).toHaveBeenCalledWith(
      [
        { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
        { exerciseId: 11, sourceWorkoutSessionExerciseId: 501 },
      ],
      // 直接追加モードと同じ合成規則（種目名 他N種目）
      'ベンチプレス 他1種目',
      '2026-07-25',
      18,
      0,
      true,
    );
    expect(mockCreateDirectScheduledWorkout).not.toHaveBeenCalled();
    expect(mockCreateScheduledWorkout).not.toHaveBeenCalled();
  });

  // カレンダー(0)→schedule-chooser(+1)→history-picker(+1)→history-load(+1)→この画面(+1)の
  // 4階層。他の経路（3階層）より1枚多い
  test('成功後はdismiss(4)してから作成した予定の目標セット編集画面へpushする', async () => {
    mockCreateHistoryScheduledWorkout.mockResolvedValue(77);
    const root = await renderAndSettle();
    await act(async () => {
      findByLabel(root, 'この時刻で予定を追加')!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDismiss).toHaveBeenCalledWith(4);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-edit',
      params: { scheduledWorkoutId: '77' },
    });
  });

  test('失敗した場合はエラーAlertを表示し、遷移しない', async () => {
    mockCreateHistoryScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
    const root = await renderAndSettle();
    await act(async () => {
      findByLabel(root, 'この時刻で予定を追加')!.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を追加できませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('historySelectionsに不正なペアが混ざっていたら全体を無効とみなし「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', historySelections: '10:500,abc' });
    const root = render();
    expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  });
});
