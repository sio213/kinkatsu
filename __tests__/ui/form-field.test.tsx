const mockUseFormScrollRegistration = jest.fn();

jest.mock('@/components/ui/form-scroll-context', () => ({
  useFormScrollRegistration: (...args: unknown[]) => mockUseFormScrollRegistration(...args),
}));

import { FormField } from '@/components/ui/form-field';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

beforeEach(() => {
  mockUseFormScrollRegistration.mockClear();
});

test('nameを渡すと、そのままuseFormScrollRegistrationへ渡される(自動スクロールの位置登録)', () => {
  act(() => {
    create(
      <FormField name="category" label="カテゴリ">
        <Text>children</Text>
      </FormField>,
    );
  });

  expect(mockUseFormScrollRegistration).toHaveBeenCalledWith('category', expect.any(Object));
});

test('name省略時はundefinedで呼ばれる(自動スクロールの登録対象外)', () => {
  act(() => {
    create(
      <FormField label="メモ">
        <Text>children</Text>
      </FormField>,
    );
  });

  expect(mockUseFormScrollRegistration).toHaveBeenCalledWith(undefined, expect.any(Object));
});
