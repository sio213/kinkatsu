import { useRoutineSavePromptStore } from '@/lib/workout/routine-save-prompt-store';

const options = useRoutineSavePromptStore.persist.getOptions();

beforeEach(() => {
  useRoutineSavePromptStore.setState({ dismissed: false, hydrated: false });
});

test('dismissでフラグが立つ', () => {
  useRoutineSavePromptStore.getState().dismiss();

  expect(useRoutineSavePromptStore.getState().dismissed).toBe(true);
});

// 復元完了を待たずに描くと、閉じたはずのユーザーにカードが数フレーム差し込まれる
test('hydratedは復元が終わるまでfalse', () => {
  expect(useRoutineSavePromptStore.getState().hydrated).toBe(false);

  useRoutineSavePromptStore.getState().setHydrated();

  expect(useRoutineSavePromptStore.getState().hydrated).toBe(true);
});

// hydratedを永続化すると、次回起動時に「復元済み」から始まってしまい待ちの意味が無くなる
test('永続化するのはdismissedだけ', () => {
  expect(options.partialize?.({ dismissed: true, hydrated: true } as never)).toEqual({ dismissed: true });
});

describe('壊れた永続値のフォールバック', () => {
  const current = { dismissed: false, hydrated: false } as never;

  test('永続値が無ければ「まだ閉じていない」', () => {
    expect(options.merge?.(undefined, current)).toMatchObject({ dismissed: false });
  });

  // 閉じたはずのカードが再び出る方が、出るべきカードが永久に出ないより取り返しがつく
  test('永続値の形が想定外なら「まだ閉じていない」', () => {
    expect(options.merge?.({ dismissed: 'yes' }, current)).toMatchObject({ dismissed: false });
  });

  test('正しく閉じた記録は引き継ぐ', () => {
    expect(options.merge?.({ dismissed: true }, current)).toMatchObject({ dismissed: true });
  });
});
