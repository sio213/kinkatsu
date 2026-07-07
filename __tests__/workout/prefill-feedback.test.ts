import { notifyPrefilled, subscribePrefilled } from '@/lib/workout/prefill-feedback';

const card = { sessionId: 1, exerciseId: 2, sessionExerciseId: 3 };

describe('prefill-feedback', () => {
  test('登録した全リスナーに通知される', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    const u1 = subscribePrefilled(l1);
    const u2 = subscribePrefilled(l2);

    notifyPrefilled([card]);

    expect(l1).toHaveBeenCalledWith([card]);
    expect(l2).toHaveBeenCalledWith([card]);
    u1();
    u2();
  });

  test('unsubscribeした後はそのリスナーだけ呼ばれなくなる（他のリスナーは影響を受けない）', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    const u1 = subscribePrefilled(l1);
    const u2 = subscribePrefilled(l2);

    u1();
    notifyPrefilled([card]);

    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledWith([card]);
    u2();
  });

  test('空配列の通知はリスナーを呼ばない', () => {
    const l1 = jest.fn();
    const u1 = subscribePrefilled(l1);

    notifyPrefilled([]);

    expect(l1).not.toHaveBeenCalled();
    u1();
  });
});
