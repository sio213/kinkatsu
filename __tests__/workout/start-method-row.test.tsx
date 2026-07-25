import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { StartMethodRow } from '@/components/workout/start-method-row';

const onPress = jest.fn();

function render(props: Partial<Parameters<typeof StartMethodRow>[0]> = {}) {
  const merged = {
    icon: 'add' as const,
    label: '種目を追加',
    description: '好きな種目を選んで開始',
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<StartMethodRow {...merged} />);
  });
  return root;
}

beforeEach(() => {
  onPress.mockClear();
});

describe('StartMethodRow', () => {
  it('ラベルと説明を表示し、タップするとonPressが呼ばれる', () => {
    const root = render();
    expect(root.root.findByProps({ children: '種目を追加' })).toBeDefined();
    expect(root.root.findByProps({ children: '好きな種目を選んで開始' })).toBeDefined();
    act(() => {
      root.root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // accessibilityLabelを付けると子のTextは読み上げられなくなるため、説明文はhintとして読ませる
  it('hint未指定なら説明文をそのままaccessibilityHintにする', () => {
    const root = render();
    expect(root.root.findByType(TouchableOpacity).props.accessibilityHint).toBe('好きな種目を選んで開始');
  });

  it('hint指定時は説明文に続けて読ませる', () => {
    const root = render({ hint: '7月25日（土）の記録として追加します' });
    expect(root.root.findByType(TouchableOpacity).props.accessibilityHint).toBe(
      '好きな種目を選んで開始。7月25日（土）の記録として追加します',
    );
  });
});
