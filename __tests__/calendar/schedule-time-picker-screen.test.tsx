const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockCreateScheduledWorkout = jest.fn();
const mockEnsurePermission = jest.fn();
const mockSkipReminderOccurrence = jest.fn();
const mockUnskipReminderOccurrence = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/lib/notifications/scheduled-workout-scheduler', () => ({
  createScheduledWorkout: (...args: unknown[]) => mockCreateScheduledWorkout(...args),
  // lib/calendar/date-grid.tsのparseDateKeyと同じ計算をここでも行う(要mock化のため実体をimportできず、
  // 依存を持たない純粋なロジックなのでインライン複製する)。過去時刻確定時のAlert分岐のテストで使う
  buildScheduledWorkoutFireDate: (dateKey: string, hour: number, minute: number) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(hour, minute, 0, 0);
    return date;
  },
}));

jest.mock('@/lib/notifications/reminder-skip-scheduler', () => ({
  skipReminderOccurrence: (...args: unknown[]) => mockSkipReminderOccurrence(...args),
  unskipReminderOccurrence: (...args: unknown[]) => mockUnskipReminderOccurrence(...args),
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
import ScheduleTimePickerScreen from '@/app/calendar/schedule-time-picker';

function findByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleTimePickerScreen));
  });
  return instance.root;
}

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
  mockEnsurePermission.mockResolvedValue('granted');
  mockSkipReminderOccurrence.mockResolvedValue({ notificationSuppressed: true });
  mockUnskipReminderOccurrence.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('ヘッダーはタイトル「時刻を選択」、サブタイトルに日付・ルーティン名をまとめて表示する（画面1のタイトル=アクション名/サブタイトル=日付という階層に合わせる）', () => {
  const root = render();
  expect(root.findByProps({ children: '時刻を選択' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）・胸の日' })).toBeDefined();
});

test('デフォルト時刻は18:00（iOSは常時インラインspinnerのDateTimePickerの初期値で確認する）', () => {
  const root = render();
  const picker = root.findByType(DateTimePicker);
  const value: Date = picker.props.value;
  expect(value.getHours()).toBe(18);
  expect(value.getMinutes()).toBe(0);
});

test('確定を押すとcreateScheduledWorkoutにroutineId/routineName/dateKey/hour/minuteを渡し、成功後router.dismiss(2)する', async () => {
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('確定を押すと先にensurePermissionを呼ぶ（通知が届くよう権限をリクエストしておく）', async () => {
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
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
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0);
  expect(mockDismiss).toHaveBeenCalledWith(2);
  expect(Alert.alert).not.toHaveBeenCalledWith('エラー', expect.anything());
});

test('権限が拒否/未許可でもcreateScheduledWorkoutは呼ばれ、予定自体は保存される（通知はスキップするだけで予定作成は止めない方針）', async () => {
  mockEnsurePermission.mockResolvedValue('denied');
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 18, 0);
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
  mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を追加できませんでした。');
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('連打してもcreateScheduledWorkoutは1回しか呼ばれない（isSubmittingRefによる二重送信防止）', async () => {
  let resolveAdd!: (v: number) => void;
  mockCreateScheduledWorkout.mockReturnValue(
    new Promise((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
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
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  expect(submitBtn.props.disabled).toBe(false);

  act(() => {
    submitBtn.props.onPress();
  });
  expect(findByLabel(root, 'この時刻で追加')!.props.disabled).toBe(true);

  await act(async () => {
    resolvePermission('granted');
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(findByLabel(root, 'この時刻で追加')!.props.disabled).toBe(false);
});

test('選択日が今日で、既に過ぎた時刻のまま確定すると「通知は届かない」旨のAlertを出し、OK後にdismissする（サイレントな機能欠落の防止）', async () => {
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  mockUseLocalSearchParams.mockReturnValue({ dateKey, routineId: '10', routineName: '胸の日' });
  const root = render();
  const picker = root.findByType(DateTimePicker);
  const pastTime = new Date(today.getTime() - 60 * 60 * 1000); // 1時間前
  act(() => {
    picker.props.onChange({}, pastTime);
  });
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockCreateScheduledWorkout).toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'この時刻は過ぎています',
    '通知は届きませんが、予定はカレンダーに追加されました。',
    expect.any(Array),
    // cancelable:falseが無いと、Androidの物理戻るボタンでOKを押さずにAlertを閉じられてしまい、
    // isSubmittingは既に解除済みのため確定ボタンを再度押せて同じ予定が重複作成される(自動レビュー指摘)
    { cancelable: false },
  );
  expect(mockDismiss).not.toHaveBeenCalled();

  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const okAction = alertCall[2].find((b: { text?: string }) => b.text === 'OK');
  act(() => {
    okAction.onPress();
  });
  expect(mockDismiss).toHaveBeenCalledWith(2);
});

test('失敗後はisSubmittingRefが解除され、再度確定を押すと再度呼べる', async () => {
  mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
  const root = render();
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
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
  expect(mockDismiss).toHaveBeenCalledWith(2);
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
  expect(() => findByLabel(root, 'この時刻で追加')).not.toThrow();
  expect(findByLabel(root, 'この時刻で追加')).toBeUndefined();
});

test('routineIdが正の整数の文字列であれば通常表示になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25', routineId: '10', routineName: '胸の日' });
  const root = render();
  expect(findByLabel(root, 'この時刻で追加')).toBeDefined();
});

test('dateKeyが不正な形式の場合も「見つかりません」画面になり、createScheduledWorkoutは呼ばれない（parseDateKeyへ渡してクラッシュしないためのガード）', () => {
  mockUseLocalSearchParams.mockReturnValue({ dateKey: 'not-a-date', routineId: '10', routineName: '胸の日' });
  const root = render();
  expect(root.findByProps({ children: 'ルーティンが見つかりません' })).toBeDefined();
  expect(findByLabel(root, 'この時刻で追加')).toBeUndefined();
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
  const submitBtn = findByLabel(root, 'この時刻で追加')!;
  await act(async () => {
    submitBtn.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 20, 15);
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

describe('差し替えモード（PR10-6b、replaceReminderId等がparamsに渡る場合）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({
      dateKey: '2026-07-25',
      routineId: '10',
      routineName: '背中の日',
      replaceReminderId: '1',
      replaceHour: '7',
      replaceMinute: '30',
    });
  });

  test('デフォルト時刻は18:00ではなく元のリマインダーの時刻(replaceHour/replaceMinute)になる', () => {
    const root = render();
    const picker = root.findByType(DateTimePicker);
    const value: Date = picker.props.value;
    expect(value.getHours()).toBe(7);
    expect(value.getMinutes()).toBe(30);
  });

  test('確定ボタンのラベルは「この時刻で差し替え」になる', () => {
    const root = render();
    expect(findByLabel(root, 'この時刻で差し替え')).toBeDefined();
    expect(findByLabel(root, 'この時刻で追加')).toBeUndefined();
  });

  test('確定を押すと、skipReminderOccurrence(元のreminderId, 選択日)→createScheduledWorkoutの順で呼ばれる', async () => {
    const root = render();
    const callOrder: string[] = [];
    mockSkipReminderOccurrence.mockImplementation(async () => {
      callOrder.push('skip');
      return { notificationSuppressed: true };
    });
    mockCreateScheduledWorkout.mockImplementation(async () => {
      callOrder.push('create');
      return 1;
    });
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSkipReminderOccurrence).toHaveBeenCalledWith(1, '2026-07-25');
    expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '背中の日', '2026-07-25', 7, 30);
    expect(callOrder).toEqual(['skip', 'create']);
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  test('スキップに失敗した場合は「差し替えできませんでした。」エラーを表示し、createScheduledWorkoutは呼ばれない', async () => {
    mockSkipReminderOccurrence.mockRejectedValueOnce(new Error('fail'));
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '差し替えできませんでした。');
    expect(mockCreateScheduledWorkout).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  test('skipReminderOccurrenceが成功しcreateScheduledWorkoutが失敗した場合、unskipReminderOccurrenceで元のスキップを巻き戻してからエラーAlertを表示する(@reviewer Major指摘: 半端な状態の防止)', async () => {
    mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSkipReminderOccurrence).toHaveBeenCalledWith(1, '2026-07-25');
    expect(mockUnskipReminderOccurrence).toHaveBeenCalledWith(1, '2026-07-25');
    expect(Alert.alert).toHaveBeenCalledWith('エラー', '差し替えできませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  test('巻き戻し(unskipReminderOccurrence)自体が失敗しても、握りつぶしてエラーAlertは通常通り表示する', async () => {
    mockCreateScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
    mockUnskipReminderOccurrence.mockRejectedValueOnce(new Error('rollback failed'));
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '差し替えできませんでした。');
  });

  test('スキップが失敗した場合はunskipReminderOccurrence(巻き戻し)は呼ばれない(そもそもスキップが成立していないため)', async () => {
    mockSkipReminderOccurrence.mockRejectedValueOnce(new Error('fail'));
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUnskipReminderOccurrence).not.toHaveBeenCalled();
  });

  test('notificationSuppressed: falseの場合(通知APIの想定外エラー等)、差し替え完了時にその旨のAlertを表示する(@reviewer Major指摘: 通常スキップと同じ警告をこの経路だけ握り潰していた。PR10-6cでネイティブ方式も抑止可能になったため文言更新)', async () => {
    mockSkipReminderOccurrence.mockResolvedValueOnce({ notificationSuppressed: false });
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      '差し替えました',
      '差し替えが完了しました。\n元の予定の新しい通知の登録処理に失敗した可能性があります。念のため指定時刻に通知が届いていないかご確認ください。',
      expect.any(Array),
      { cancelable: false },
    );
    expect(mockDismiss).not.toHaveBeenCalled();

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const okAction = alertCall[2].find((b: { text?: string }) => b.text === 'OK');
    act(() => {
      okAction.onPress();
    });
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  test('notificationSuppressed: trueの通常ケースでは、差し替え完了時にAlertを出さずそのままdismissする', async () => {
    mockSkipReminderOccurrence.mockResolvedValueOnce({ notificationSuppressed: true });
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  test('過去時刻の場合の警告Alertの文言も差し替え用になる', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      dateKey: '2020-01-01',
      routineId: '10',
      routineName: '背中の日',
      replaceReminderId: '1',
      replaceHour: '7',
      replaceMinute: '30',
    });
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で差し替え')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'この時刻は過ぎています',
      '通知は届きませんが、差し替えは完了しました。',
      expect.any(Array),
      { cancelable: false },
    );
  });
});

describe('通常モード（差し替えパラメータが無い場合）はskipReminderOccurrenceを一切呼ばない', () => {
  test('確定してもskipReminderOccurrenceは呼ばれない', async () => {
    const root = render();
    const submitBtn = findByLabel(root, 'この時刻で追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSkipReminderOccurrence).not.toHaveBeenCalled();
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

    const submitBtn = findByLabel(root, 'この時刻で追加')!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateScheduledWorkout).toHaveBeenCalledWith(10, '胸の日', '2026-07-25', 9, 45);
  });
});
