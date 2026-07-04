const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockAddExercise = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => ({ addExercise: mockAddExercise }),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import ExerciseNewScreen from '@/app/exercise/new';

function getInputs(root: ReactTestInstance) {
  return root.findAllByType(TextInput);
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => t.props.children === label),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExerciseNewScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ name: undefined });
  mockAddExercise.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('nameパラメータがある場合、種目名の初期値に反映される', () => {
  mockUseLocalSearchParams.mockReturnValue({ name: 'ベンチプレス' });

  const root = render();
  const [nameInput] = getInputs(root);
  expect(nameInput.props.value).toBe('ベンチプレス');
});

test('保存に成功するとaddExerciseが呼ばれ、router.backで画面を閉じる', async () => {
  const root = render();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('スクワット');
  });
  const legChip = findButtonByLabel(root, '脚')!;
  await act(async () => {
    legChip.props.onPress();
  });

  const submitBtn = findButtonByLabel(root, '保存する')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockAddExercise).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'スクワット', category: 'leg' }),
  );
  expect(mockBack).toHaveBeenCalled();
});

test('保存に失敗するとAlertが表示され、router.backは呼ばれない', async () => {
  mockAddExercise.mockRejectedValueOnce(new Error('insert failed'));
  const root = render();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('スクワット');
  });
  const legChip = findButtonByLabel(root, '脚')!;
  await act(async () => {
    legChip.props.onPress();
  });

  const submitBtn = findButtonByLabel(root, '保存する')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目の保存に失敗しました。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('未入力のまま保存を押すと、保存ボタンがdisabledになりaddExerciseは呼ばれない', async () => {
  const root = render();

  const submitBtn = findButtonByLabel(root, '保存する')!;
  expect(submitBtn.props.disabled).toBe(false);

  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(mockAddExercise).not.toHaveBeenCalled();
  expect(findButtonByLabel(root, '保存する')!.props.disabled).toBe(true);
});
