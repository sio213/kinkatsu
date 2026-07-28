import { chipStyles } from '@/components/exercises/chip-styles';
import { PeriodFilterChips } from '@/components/exercises/period-filter-chips';
import type { ProgressPeriod } from '@/lib/exercises/progress';
import { TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

function render(value: ProgressPeriod, onChange = jest.fn()) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<PeriodFilterChips value={value} onChange={onChange} />);
  });
  return { root: root.root, onChange };
}

function chip(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((t: ReactTestInstance) => t.props.accessibilityLabel === label)!;
}

describe('PeriodFilterChips', () => {
  it('1ヶ月／3ヶ月／6ヶ月／全期間の4つを出す（有料プランのロックは課金基盤が無いため未実装）', () => {
    const { root } = render('3m');
    for (const label of ['1ヶ月', '3ヶ月', '6ヶ月', '全期間']) {
      expect(chip(root, label)).toBeDefined();
    }
  });

  it('選択中のチップだけがactiveのスタイルと選択状態を持つ', () => {
    const { root } = render('3m');

    expect(chip(root, '3ヶ月').props.accessibilityState).toEqual({ checked: true });
    expect(chip(root, '1ヶ月').props.accessibilityState).toEqual({ checked: false });
    expect(chip(root, '3ヶ月').props.style).toContain(chipStyles.chipActive);
    expect(chip(root, '1ヶ月').props.style).not.toContain(chipStyles.chipActive);
  });

  it('カテゴリチップと同じ標準スタイルの上に、小サイズの差分を重ねている', () => {
    const { root } = render('3m');
    const style = chip(root, '1ヶ月').props.style;
    expect(style).toContain(chipStyles.chip);
    expect(style).toContain(chipStyles.chipSmall);
  });

  it('チップの高さが44ptに満たないぶんをhitSlopで補っている', () => {
    const { root } = render('3m');
    expect(chip(root, '1ヶ月').props.hitSlop).toMatchObject({ top: 9, bottom: 9 });
  });

  it('押すと選んだ期間を通知する', () => {
    const { root, onChange } = render('3m');
    act(() => {
      chip(root, '全期間').props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
