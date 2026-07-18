import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { StartMethodCard } from '@/components/workout/start-method-card';

const onPress = jest.fn();

function render(props: Partial<Parameters<typeof StartMethodCard>[0]> = {}) {
  const merged = { icon: 'dumbbell.fill' as const, label: '自分で選ぶ', onPress, ...props };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<StartMethodCard {...merged} />);
  });
  return root;
}

beforeEach(() => {
  onPress.mockClear();
});

describe('StartMethodCard', () => {
  it('ラベルを表示し、タップするとonPressが呼ばれる', () => {
    const root = render();
    expect(root.root.findByProps({ children: '自分で選ぶ' })).toBeDefined();
    act(() => {
      root.root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled=trueのとき「準備中」バッジを表示し、onPressを持たない', () => {
    const root = render({ disabled: true });
    expect(root.root.findByProps({ children: '準備中' })).toBeDefined();
    expect(root.root.findByType(TouchableOpacity).props.onPress).toBeUndefined();
    expect(root.root.findByType(TouchableOpacity).props.accessibilityState).toEqual({ disabled: true });
  });

  it('disabled=falseのとき「準備中」バッジを表示しない', () => {
    const root = render({ disabled: false });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('準備中');
  });
});
