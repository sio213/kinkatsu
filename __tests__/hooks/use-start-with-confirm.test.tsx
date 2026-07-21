const mockEndWorkoutSession = jest.fn();

jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
}));

import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';

function makeHarness<TExtra = undefined>(
  activeSession: { id: number } | null,
  navigate: (sessionId: number) => void,
  startWorkoutFrom: (id: number, extra?: TExtra) => Promise<{ sessionId: number } | null>,
) {
  let captured!: (id: number, title: string, extra?: TExtra) => void;
  function Harness() {
    captured = useStartWithConfirm(activeSession, navigate, startWorkoutFrom);
    return null;
  }
  act(() => {
    create(React.createElement(Harness));
  });
  return () => captured;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// useStartWithConfirmは「進行中セッションがあれば確認ダイアログを挟む」配線だけを担い、
// 実際の開始関数(startWorkoutFrom)・遷移(navigate)は呼び出し元から注入される
// （hooks/use-start-with-confirm.ts、routine一覧・カレンダー選択日パネルの2箇所から共有）
describe('useStartWithConfirm', () => {
  test('進行中セッションが無ければ確認なしで即座にstartWorkoutFromを呼び、成功したらnavigateする', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    const getHandler = makeHarness(null, mockNavigate, mockStartWorkoutFrom);

    await act(async () => {
      getHandler()(10, '胸の日');
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockStartWorkoutFrom).toHaveBeenCalledWith(10);
    expect(mockNavigate).toHaveBeenCalledWith(77);
  });

  test('進行中セッションが無く、startWorkoutFromがnullを返した場合はnavigateしない', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue(null);
    const getHandler = makeHarness(null, mockNavigate, mockStartWorkoutFrom);

    await act(async () => {
      getHandler()(10, '胸の日');
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('進行中セッションがある場合、確認Alertを出しstartWorkoutFromは呼ばない（キャンセル可能な確認段階）', () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    const getHandler = makeHarness({ id: 5 }, mockNavigate, mockStartWorkoutFrom);

    act(() => {
      getHandler()(10, '胸の日');
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      '実施中のトレーニングを終了しますか？',
      'ここまでの記録を保存して「胸の日」を開始しますか？',
      expect.any(Array),
    );
    expect(mockStartWorkoutFrom).not.toHaveBeenCalled();
  });

  test('確認Alertで「記録して開始」を選ぶと、進行中セッションをendWorkoutSessionで終了してからstartWorkoutFromで新規開始しnavigateする', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    mockEndWorkoutSession.mockResolvedValue(undefined);
    const getHandler = makeHarness({ id: 5 }, mockNavigate, mockStartWorkoutFrom);

    act(() => {
      getHandler()(10, '胸の日');
    });
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '記録して開始');

    await act(async () => {
      await confirmAction.onPress();
    });

    expect(mockEndWorkoutSession).toHaveBeenCalledWith(5);
    expect(mockStartWorkoutFrom).toHaveBeenCalledWith(10);
    expect(mockNavigate).toHaveBeenCalledWith(77);
  });

  test('確認Alertで「キャンセル」相当（confirmActionを呼ばない）場合はendWorkoutSession・startWorkoutFromどちらも呼ばれない', () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    const getHandler = makeHarness({ id: 5 }, mockNavigate, mockStartWorkoutFrom);

    act(() => {
      getHandler()(10, '胸の日');
    });

    expect(mockEndWorkoutSession).not.toHaveBeenCalled();
    expect(mockStartWorkoutFrom).not.toHaveBeenCalled();
  });

  test('startWorkoutFromが失敗した場合はエラーAlertを表示し、navigateしない', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockRejectedValue(new Error('fail'));
    const getHandler = makeHarness(null, mockNavigate, mockStartWorkoutFrom);

    await act(async () => {
      getHandler()(10, '胸の日');
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // TExtra（未実体化のリマインダー予定を開始する際にmaterializeReminderOccurrenceへ渡す
  // reminderId/hour/minute等、id/titleだけでは開始対象を特定できない呼び出し元向けの追加データ、
  // app/(tabs)/calendar.tsxのstartWorkoutFromReminderOccurrence）の配線自体を、
  // このフック単体でも固定しておく（@tester指摘: 従来extra無しの呼び出ししかテストされておらず、
  // 2引数目が正しく渡る契約が守られているかフック単体では検証されていなかった）
  test('extraを渡した場合、startWorkoutFromはid・extraの2引数で呼ばれる', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    const getHandler = makeHarness<{ reminderId: number }>(null, mockNavigate, mockStartWorkoutFrom);
    const extra = { reminderId: 1 };

    await act(async () => {
      getHandler()(10, '胸の日', extra);
    });

    expect(mockStartWorkoutFrom).toHaveBeenCalledWith(10, extra);
    expect(mockNavigate).toHaveBeenCalledWith(77);
  });

  test('進行中セッションがありextraも渡す場合、記録して開始→startWorkoutFrom(id, extra)の順で呼ばれる', async () => {
    const mockNavigate = jest.fn();
    const mockStartWorkoutFrom = jest.fn().mockResolvedValue({ sessionId: 77 });
    mockEndWorkoutSession.mockResolvedValue(undefined);
    const getHandler = makeHarness<{ reminderId: number }>({ id: 5 }, mockNavigate, mockStartWorkoutFrom);
    const extra = { reminderId: 1 };

    act(() => {
      getHandler()(10, '胸の日', extra);
    });
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '記録して開始');
    await act(async () => {
      await confirmAction.onPress();
    });

    expect(mockEndWorkoutSession).toHaveBeenCalledWith(5);
    expect(mockStartWorkoutFrom).toHaveBeenCalledWith(10, extra);
    expect(mockNavigate).toHaveBeenCalledWith(77);
  });
});
