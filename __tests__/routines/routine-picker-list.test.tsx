import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function render(props: Partial<React.ComponentProps<typeof RoutinePickerList>> = {}) {
  const onSelect = jest.fn();
  const onPressBack = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <RoutinePickerList
        routines={[baseRoutine()]}
        summaries={new Map([[1, { exerciseCount: 3, categories: ['chest'] }]])}
        onSelect={onSelect}
        onPressBack={onPressBack}
        {...props}
      />,
    );
  });
  return { root: instance.root, onSelect, onPressBack };
}

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes(label));
}

// app/workout/routine-picker.tsx・app/calendar/schedule-routine-picker.tsx・
// app/workout/past-routine-picker.tsxの3画面が共有する描画部分（2026-07-20、@reviewer指摘:
// 3本目のピッカー画面到達でrule of threeの閾値に達したため描画のみ共通化した）
test('ルーティン一覧を表示する', () => {
  const { root } = render();
  expect(root.findByProps({ children: '胸の日' })).toBeDefined();
});

test('カードをタップするとonSelectに該当ルーティンが渡る', () => {
  const { root, onSelect } = render();
  act(() => {
    findCardByLabel(root, '胸の日')!.props.onPress();
  });
  expect(onSelect).toHaveBeenCalledWith(baseRoutine());
});

test('複数ルーティンが表示された状態で、押したカードに対応するルーティンが渡る（先頭固定になっていないことの確認）', () => {
  const { root, onSelect } = render({
    routines: [baseRoutine({ id: 1, name: '胸の日' }), baseRoutine({ id: 2, name: '脚の日' })],
    summaries: new Map([
      [1, { exerciseCount: 3, categories: ['chest'] }],
      [2, { exerciseCount: 4, categories: ['leg'] }],
    ]),
  });
  act(() => {
    findCardByLabel(root, '脚の日')!.props.onPress();
  });
  expect(onSelect).toHaveBeenCalledWith(baseRoutine({ id: 2, name: '脚の日' }));
});

test('summariesに無いルーティンは種目数0・カテゴリ無しで表示する（防御的なフォールバック）', () => {
  const { root } = render({ summaries: new Map() });
  const texts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
  expect(texts).toContain('0種目');
});

test('ルーティンが0件の場合は空状態を表示し、戻るボタンでonPressBackを呼ぶ', () => {
  const { root, onPressBack } = render({ routines: [] });
  expect(root.findByProps({ children: 'ルーティンがまだありません' })).toBeDefined();

  const backBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(onPressBack).toHaveBeenCalled();
});
