import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { DayEmptyState } from '@/components/calendar/day-empty-state';

const onPressAction = jest.fn();

function render(props: Partial<Parameters<typeof DayEmptyState>[0]> = {}) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <DayEmptyState
        buttonIcon="play.fill"
        actionLabel="トレーニングを開始"
        onPressAction={onPressAction}
        {...props}
      />,
    );
  });
  return root;
}

beforeEach(() => {
  onPressAction.mockClear();
});

describe('DayEmptyState', () => {
  it('「記録がありません」テキストとアクションボタンを表示する', () => {
    const root = render();
    expect(root.root.findByProps({ children: '記録がありません' })).toBeDefined();
    expect(root.root.findByProps({ children: 'トレーニングを開始' })).toBeDefined();
  });

  it('ボタンをタップするとonPressActionが呼ばれる', () => {
    const root = render();
    act(() => {
      root.root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPressAction).toHaveBeenCalledTimes(1);
  });

  it('textを渡すと「記録がありません」の代わりにそのテキストを表示する（未来日の「予定がありません」用）', () => {
    const root = render({ text: '予定がありません' });
    expect(root.root.findByProps({ children: '予定がありません' })).toBeDefined();
    expect(() => root.root.findByProps({ children: '記録がありません' })).toThrow();
  });
});
