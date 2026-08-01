// createStartChooserSession は「開始選択画面からのフローで、確定した瞬間にだけセッションを作る」
// ための分岐。以前は画面を開いた時点で空セッションを作っており、戻ると空の記録がDBに残っていた
// （2026-07-25 のユーザー指摘）。pastDateKey の妥当性で「過去日の事後記録」と「今日のライブ
// セッション」を出し分けるところがこの関数の全てなので、その境界を固定する。
/* eslint-disable no-var */
var mockCreatePastWorkoutSession: jest.Mock;
var mockStartWorkoutSession: jest.Mock;

jest.mock('@/lib/workout/session', () => {
  mockCreatePastWorkoutSession = jest.fn(async () => ({ id: 100 }));
  mockStartWorkoutSession = jest.fn(async () => ({ id: 200 }));
  return {
    createPastWorkoutSession: mockCreatePastWorkoutSession,
    startWorkoutSession: mockStartWorkoutSession,
  };
});

import { dateKeyToNoonMs } from '@/lib/calendar/date-grid';
import { createStartChooserSession } from '@/lib/workout/start-chooser-session';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createStartChooserSession', () => {
  it('妥当な日付キーなら、その日の正午の完了済みセッションを作る', async () => {
    await expect(createStartChooserSession('2026-07-20')).resolves.toBe(100);

    expect(mockCreatePastWorkoutSession).toHaveBeenCalledWith(dateKeyToNoonMs('2026-07-20'));
    expect(mockStartWorkoutSession).not.toHaveBeenCalled();
  });

  it('日付キーを渡さなければ今日のライブセッションを作る', async () => {
    await expect(createStartChooserSession()).resolves.toBe(200);

    expect(mockStartWorkoutSession).toHaveBeenCalledTimes(1);
    expect(mockCreatePastWorkoutSession).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-date', '2026-13-01', '2026/07/20'])(
    '日付キーとして不正な %s はライブセッション扱いにフォールバックする',
    async (key) => {
      await expect(createStartChooserSession(key)).resolves.toBe(200);

      expect(mockStartWorkoutSession).toHaveBeenCalledTimes(1);
      expect(mockCreatePastWorkoutSession).not.toHaveBeenCalled();
    },
  );
});
