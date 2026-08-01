// 直接予定の目標セット編集行。この画面には✓確定のような最終確定ステップが無く、
// 400msデバウンスの自動保存が唯一の保存経路なので、そこが崩れると入力が丸ごと消える。
//   - 打鍵のたびに書かない（予定全体を購読しているフックが毎打鍵で再発火するため）
//   - 連打してもデバウンスが伸び、最後の1回だけ書く
//   - アンマウント時に保留中の分を取りこぼさず書く
// 上記に加え、計測タイプごとの列構成（時間列だけ DurationInput になる）も固定する。
const mockUpdateScheduledWorkoutSetValues = jest.fn();

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  updateScheduledWorkoutSetValues: (...args: unknown[]) =>
    mockUpdateScheduledWorkoutSetValues(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { DurationInput } from '@/components/workout/duration-input';
import { ScheduledWorkoutSetRow } from '@/components/calendar/scheduled-workout-set-row';
import type { MeasurementType } from '@/lib/exercises/constants';

type SetSeed = {
  id: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

function makeSet(overrides: Partial<SetSeed> = {}): SetSeed {
  return {
    id: 1,
    weight: 60,
    reps: 10,
    durationSeconds: null,
    distanceMeters: null,
    ...overrides,
  };
}

const onDelete = jest.fn();

function render(measurementType: MeasurementType = 'weight_reps', set = makeSet()) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(ScheduledWorkoutSetRow, {
        set: set as never,
        setNumber: 2,
        measurementType,
        exerciseName: 'ベンチプレス',
        onDelete,
      }),
    );
  });
  return instance;
}

function inputByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(BoxedTextInput)
    .find((i) => i.props.accessibilityLabel === label)!;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUpdateScheduledWorkoutSetValues.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ScheduledWorkoutSetRow の表示', () => {
  it('既存の値を各列の初期値として出す', () => {
    const root = render().root;

    expect(inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.value).toBe('60');
    expect(inputByLabel(root, 'ベンチプレス セット2 回数').props.value).toBe('10');
  });

  it('値が未設定の列は空にする（0 を埋めない）', () => {
    const root = render('weight_reps', makeSet({ weight: null, reps: null })).root;

    expect(inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.value).toBe('');
  });

  it('時間を持つ計測タイプでは時間列だけ DurationInput にする', () => {
    const root = render('weight_time', makeSet({ durationSeconds: 60 })).root;

    expect(root.findAllByType(DurationInput)).toHaveLength(1);
    expect(inputByLabel(root, 'ベンチプレス セット2 重量(kg)')).toBeDefined();
  });

  it('削除ボタンを押すと onDelete を呼ぶ', () => {
    const root = render().root;
    const button = root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === 'ベンチプレス セット2を削除')!;

    act(() => button.props.onPress());

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('ScheduledWorkoutSetRow の自動保存', () => {
  it('入力した直後には書き込まない', () => {
    const root = render().root;

    act(() => inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.onChangeText('70'));

    expect(mockUpdateScheduledWorkoutSetValues).not.toHaveBeenCalled();
  });

  it('400ms 経つと入力値を書き込む', () => {
    const root = render().root;

    act(() => inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.onChangeText('70'));
    act(() => jest.advanceTimersByTime(400));

    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledWith(1, {
      weight: 70,
      reps: 10,
      durationSeconds: null,
      distanceMeters: null,
    });
  });

  it('連続入力ではデバウンスが伸び、最後の値だけを1回書く', () => {
    const root = render().root;
    const weight = inputByLabel(root, 'ベンチプレス セット2 重量(kg)');

    act(() => weight.props.onChangeText('7'));
    act(() => jest.advanceTimersByTime(300));
    act(() => weight.props.onChangeText('75'));
    act(() => jest.advanceTimersByTime(300));
    expect(mockUpdateScheduledWorkoutSetValues).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(100));
    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledTimes(1);
    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ weight: 75 }),
    );
  });

  it('別々の列に入れた値をまとめて書く', () => {
    const root = render().root;

    act(() => inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.onChangeText('70'));
    act(() => inputByLabel(root, 'ベンチプレス セット2 回数').props.onChangeText('8'));
    act(() => jest.advanceTimersByTime(400));

    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ weight: 70, reps: 8 }),
    );
  });

  it('値を消したら null として書き込む', () => {
    const root = render().root;

    act(() => inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.onChangeText(''));
    act(() => jest.advanceTimersByTime(400));

    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ weight: null }),
    );
  });

  it('デバウンス保留中にアンマウントされても取りこぼさず書く', () => {
    const instance = render();

    act(() => inputByLabel(instance.root, 'ベンチプレス セット2 重量(kg)').props.onChangeText('70'));
    act(() => instance.unmount());

    expect(mockUpdateScheduledWorkoutSetValues).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ weight: 70 }),
    );
  });

  it('保留中の入力が無ければアンマウントで余計な書き込みをしない', () => {
    const instance = render();

    act(() => instance.unmount());

    expect(mockUpdateScheduledWorkoutSetValues).not.toHaveBeenCalled();
  });

  it('書き込みに失敗しても Alert は出さずログだけに留める（毎打鍵でアラートが出ないように）', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateScheduledWorkoutSetValues.mockRejectedValue(new Error('boom'));
    const root = render().root;

    act(() => inputByLabel(root, 'ベンチプレス セット2 重量(kg)').props.onChangeText('70'));
    act(() => jest.advanceTimersByTime(400));
    await act(async () => {});

    expect(spy).toHaveBeenCalledWith('[scheduled workout set auto save]', expect.any(Error));
    spy.mockRestore();
  });
});
