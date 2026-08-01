// 種目編集画面。フォーム本体（ExerciseFormScreen）は exercise-new-screen.test.tsx が見ているので、
// ここは編集固有の3点に絞る。
//   - 読み込みが終わるまで何も描かない（存在するのに一瞬「見つかりません」が出ないように）
//   - 対象が無いときは戻る導線つきの NotFoundScreen を出す（以前は手書きで戻れなかった／@reviewer指摘）
//   - 保存の成否で戻る／アラートを出し分け、DB書き込みを silent fail させない
const mockBack = jest.fn();
const mockUseExercise = jest.fn();
const mockUpdateExercise = jest.fn();
const mockUseExerciseRecordCount = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: '7' }),
  useNavigation: () => ({ addListener: () => () => {} }),
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercise: (...args: unknown[]) => mockUseExercise(...args),
  useExercises: () => ({ updateExercise: mockUpdateExercise }),
}));

// このフックはdb/clientを引き込むため、モックしないとテストスイートごと起動できない
jest.mock('@/hooks/use-exercise-record-count', () => ({
  useExerciseRecordCount: (...args: unknown[]) => mockUseExerciseRecordCount(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import type { Exercise } from '@/db/schema';
import { ExerciseFormScreen } from '@/components/exercises/exercise-form-screen';
import ExerciseEditScreen from '@/app/exercise/edit/[id]';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 7,
    name: 'ベンチプレス',
    slug: null,
    category: 'chest',
    favorite: true,
    note: 'メモ',
    formPoints: JSON.stringify(['肩甲骨を寄せる']),
    source: 'custom',
    measurementType: 'weight_reps',
    pairedWeights: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExerciseEditScreen));
  });
  return instance.root;
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseExercise.mockReturnValue({ exercise: makeExercise(), loaded: true });
  mockUseExerciseRecordCount.mockReturnValue({ count: 0, loaded: true });
  mockUpdateExercise.mockResolvedValue(undefined);
});

describe('ExerciseEditScreen', () => {
  it('読み込み中は何も描かない', () => {
    mockUseExercise.mockReturnValue({ exercise: undefined, loaded: false });

    const root = render();

    expect(root.findAllByType(ExerciseFormScreen)).toHaveLength(0);
    expect(allTexts(root)).not.toContain('種目が見つかりません');
  });

  it('対象の種目が無ければ、戻る導線つきの見つかりません表示を出す', () => {
    mockUseExercise.mockReturnValue({ exercise: undefined, loaded: true });

    const root = render();

    expect(allTexts(root)).toContain('種目が見つかりません');
    const back = root
      .findAllByType(TouchableOpacity)
      .find((b) => allTexts(b).includes('戻る'));
    act(() => back!.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it('既存の値をフォームの初期値として渡す（フォームのポイントはパース済みの配列にする）', () => {
    const form = render().findByType(ExerciseFormScreen);

    expect(form.props.initial).toEqual({
      name: 'ベンチプレス',
      category: 'chest',
      note: 'メモ',
      favorite: true,
      formPoints: ['肩甲骨を寄せる'],
      source: 'custom',
      measurementType: 'weight_reps',
    });
  });

  it('記録件数をフォームへ渡す（「記録する項目」を変えたときの確認ダイアログの発火判定に使う）', () => {
    mockUseExerciseRecordCount.mockReturnValue({ count: 12, loaded: true });

    const form = render().findByType(ExerciseFormScreen);

    expect(mockUseExerciseRecordCount).toHaveBeenCalledWith(7);
    expect(form.props.recordCount).toBe(12);
  });

  it('URLのidで更新し、成功したら前の画面へ戻る', async () => {
    const form = render().findByType(ExerciseFormScreen);
    const values = { name: 'インクラインベンチプレス', category: 'chest' };

    await act(async () => {
      await form.props.onSubmit(values);
    });

    expect(mockUpdateExercise).toHaveBeenCalledWith(7, values);
    expect(mockBack).toHaveBeenCalled();
  });

  it('保存に失敗したらアラートを出し、画面を閉じない', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateExercise.mockRejectedValue(new Error('boom'));
    const form = render().findByType(ExerciseFormScreen);

    await act(async () => {
      await form.props.onSubmit({ name: 'ベンチプレス', category: 'chest' });
    });

    expect(alertSpy).toHaveBeenCalledWith('エラー', '種目の保存に失敗しました。');
    expect(mockBack).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[exercise update]', expect.any(Error));

    alertSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
