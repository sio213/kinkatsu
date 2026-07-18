import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
import { MonthGrid } from '@/components/calendar/month-grid';
import { getCalendarCategoryColor } from '@/lib/calendar/category-color';
import { Colors } from '@/constants/theme';

const onSelectDate = jest.fn();

function render(props: Partial<Parameters<typeof MonthGrid>[0]> = {}) {
  const merged = {
    year: 2026,
    month: 6, // 7月(0始まり)。1日は水曜、31日まで
    today: new Date(2026, 6, 18),
    selectedDate: new Date(2026, 6, 18),
    onSelectDate,
    dayCategories: new Map<string, string>(),
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<MonthGrid {...merged} />);
  });
  return root;
}

function findTouchableForDay(root: ReturnType<typeof create>, label: string) {
  return root.root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string).startsWith(label))!;
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

  describe('実績データ(dayCategories)の反映', () => {
    it('実績があり非選択の日は代表カテゴリの色で塗りつぶされる（枠線は付かない）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18), // 5日とは別の日を選択中にしておく
        dayCategories: new Map([['2026-07-05', 'chest']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[1];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
    });

    it('実績があり選択中の日は枠線が代表カテゴリの色になり、塗りつぶしはされない', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 5),
        dayCategories: new Map([['2026-07-05', 'leg']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[1];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderColor: getCalendarCategoryColor('leg') })]),
      );
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
    });

    it('実績が無い日は選択中でも枠線がaccent色のまま（デフォルト色）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 5),
        dayCategories: new Map(),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[1];
      expect(cellView.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: Colors.accent })]));
    });

    it('実績がある日のaccessibilityLabelには「実施日」とカテゴリ名を含む', () => {
      const root = render({ dayCategories: new Map([['2026-07-05', 'chest']]) });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日、実施日、胸');
    });

    it('実績が無い日のaccessibilityLabelには「実施日」を含まない', () => {
      const root = render({ dayCategories: new Map() });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日');
    });

    it('今日×実績あり×非選択の日は塗りつぶされ、下線バーは白(onAccent)になる', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 18), // 別日を選択中にしておく
        dayCategories: new Map([['2026-07-05', 'chest']]),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[1];
      const underlineBar = views[views.length - 1];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.onAccent })]),
      );
    });

    it('今日×実績なし×非選択の日は塗りつぶされず、下線バーはaccent色になる', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 18),
        dayCategories: new Map(),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[1];
      const underlineBar = views[views.length - 1];
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.accent })]),
      );
    });

    it('今日×選択中×実績ありの日は枠線・下線ともカテゴリ色になり、塗りつぶしはされない', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 5),
        dayCategories: new Map([['2026-07-05', 'leg']]),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[1];
      const underlineBar = views[views.length - 1];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderColor: getCalendarCategoryColor('leg') })]),
      );
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('leg') })]),
      );
    });

    it('今日×選択中×実績なしの日は枠線・下線ともaccent色（デフォルト状態）', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 5),
        dayCategories: new Map(),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[1];
      const underlineBar = views[views.length - 1];
      expect(cellView.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: Colors.accent })]));
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.accent })]),
      );
    });
  });
});
