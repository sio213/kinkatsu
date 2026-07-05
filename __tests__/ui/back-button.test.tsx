const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { BackButton } from '@/components/ui/back-button';

beforeEach(() => {
  jest.clearAllMocks();
});

test('canGoBackがtrueのときは戻るボタンが表示され、押すとrouter.backが呼ばれる', () => {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<BackButton canGoBack />);
  });

  const button = instance.root.findByType(TouchableOpacity);
  act(() => {
    button.props.onPress();
  });

  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('canGoBackがfalseのときは何も表示しない（スタック最下層）', () => {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<BackButton canGoBack={false} />);
  });

  expect(instance.root.findAllByType(TouchableOpacity)).toHaveLength(0);
});
