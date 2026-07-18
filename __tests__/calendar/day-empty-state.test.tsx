import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { DayEmptyState } from '@/components/calendar/day-empty-state';

const onPressAction = jest.fn();

function render() {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <DayEmptyState buttonIcon="play.fill" actionLabel="トレーニングを開始" onPressAction={onPressAction} />,
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
});
