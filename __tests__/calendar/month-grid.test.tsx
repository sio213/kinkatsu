import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { MonthGrid } from '@/components/calendar/month-grid';

const onSelectDate = jest.fn();

function render(props: Partial<Parameters<typeof MonthGrid>[0]> = {}) {
  const merged = {
    year: 2026,
    month: 6, // 7月(0始まり)。1日は水曜、31日まで
    today: new Date(2026, 6, 18),
    selectedDate: new Date(2026, 6, 18),
    onSelectDate,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<MonthGrid {...merged} />);
  });
  return root;
}

beforeEach(() => {
  onSelectDate.mockClear();
});

describe('MonthGrid', () => {
  it('前月/翌月の日付はTouchableOpacityを持たずタップできない（当月日数分だけタップ可能）', () => {
    const root = render();
    const touchables = root.root.findAllByType(TouchableOpacity);
    // 2026年7月は31日まで
    expect(touchables).toHaveLength(31);
  });

  it('当月の日付をタップするとonSelectDateにその日付が渡る', () => {
    const root = render();
    const touchables = root.root.findAllByType(TouchableOpacity);
    act(() => {
      (touchables[0].props.onPress as () => void)();
    });
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    const calledWith = onSelectDate.mock.calls[0][0] as Date;
    expect(calledWith.getMonth()).toBe(6);
  });

  it('todayに一致する当月セルはaccessibilityLabelに「今日」を含む', () => {
    const root = render({ today: new Date(2026, 6, 18), selectedDate: new Date(2026, 6, 5) });
    const todayCell = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => (t.props.accessibilityLabel as string).includes('7月18日'));
    expect(todayCell?.props.accessibilityLabel).toBe('7月18日、今日');
  });

  it('todayに一致しない当月セルのaccessibilityLabelには「今日」を含まない', () => {
    const root = render({ today: new Date(2026, 6, 18), selectedDate: new Date(2026, 6, 5) });
    const otherCell = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => (t.props.accessibilityLabel as string).includes('7月5日'));
    expect(otherCell?.props.accessibilityLabel).toBe('7月5日');
  });

  it('selectedDateと一致する当月セルはaccessibilityState.selectedがtrue', () => {
    const root = render({ selectedDate: new Date(2026, 6, 5) });
    const selectedCell = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => (t.props.accessibilityLabel as string).startsWith('7月5日'));
    expect(selectedCell?.props.accessibilityState).toEqual({ selected: true });
  });

  it('曜日ラベル行は日曜始まり(日/月/火/水/木/金/土)で7件描画される', () => {
    const root = render();
    const labels = root.root
      .findAllByType(Text)
      .map((t) => t.props.children)
      .filter((c) => typeof c === 'string' && ['日', '月', '火', '水', '木', '金', '土'].includes(c));
    expect(labels).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });
});
