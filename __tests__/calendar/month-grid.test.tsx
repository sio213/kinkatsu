import { act, create } from 'react-test-renderer';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
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
    primaryCategoryByDay: new Map<string, string>(),
    categorySetByDay: new Map<string, Set<string>>(),
    primaryCategoryByScheduleDay: new Map<string, string>(),
    categorySetByScheduleDay: new Map<string, Set<string>>(),
    activeFilter: null,
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
    .findAllByType(Pressable)
    .find((t) => (t.props.accessibilityLabel as string).startsWith(label))!;
}

beforeEach(() => {
  onSelectDate.mockClear();
});

describe('MonthGrid', () => {
  it('前月/翌月の日付はPressableを持たずタップできない（当月日数分だけタップ可能）', () => {
    const root = render();
    const touchables = root.root.findAllByType(Pressable);
    // 2026年7月は31日まで
    expect(touchables).toHaveLength(31);
  });

  it('当月の日付をタップするとonSelectDateにその日付が渡る', () => {
    const root = render();
    const touchables = root.root.findAllByType(Pressable);
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
      .findAllByType(Pressable)
      .find((t) => (t.props.accessibilityLabel as string).includes('7月18日'));
    expect(todayCell?.props.accessibilityLabel).toBe('7月18日、今日');
  });

  it('todayに一致しない当月セルのaccessibilityLabelには「今日」を含まない', () => {
    const root = render({ today: new Date(2026, 6, 18), selectedDate: new Date(2026, 6, 5) });
    const otherCell = root.root
      .findAllByType(Pressable)
      .find((t) => (t.props.accessibilityLabel as string).includes('7月5日'));
    expect(otherCell?.props.accessibilityLabel).toBe('7月5日');
  });

  it('selectedDateと一致する当月セルはaccessibilityState.selectedがtrue', () => {
    const root = render({ selectedDate: new Date(2026, 6, 5) });
    const selectedCell = root.root
      .findAllByType(Pressable)
      .find((t) => (t.props.accessibilityLabel as string).startsWith('7月5日'));
    expect(selectedCell?.props.accessibilityState).toEqual({ selected: true });
  });

  describe('実績データ(dayCategories)の反映', () => {
    it('実績があり非選択の日は代表カテゴリの色で塗りつぶされる（枠線は付かない）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18), // 5日とは別の日を選択中にしておく
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
    });

    it('実績があり選択中の日は枠線が代表カテゴリの色になり、塗りつぶしはされない', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 5),
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
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
        primaryCategoryByDay: new Map(),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: Colors.accent })]));
    });

    it('実績がある日のaccessibilityLabelには「実施日」とカテゴリ名を含む', () => {
      const root = render({ primaryCategoryByDay: new Map([['2026-07-05', 'chest']]) });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日、実施日、胸');
    });

    it('実績が無い日のaccessibilityLabelには「実施日」を含まない', () => {
      const root = render({ primaryCategoryByDay: new Map() });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日');
    });

    it('今日×実績あり×非選択の日は塗りつぶされ、下線バーは白(onAccent)になる', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 18), // 別日を選択中にしておく
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[0];
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
        primaryCategoryByDay: new Map(),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[0];
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
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[0];
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
        primaryCategoryByDay: new Map(),
      });
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const cellView = views[0];
      const underlineBar = views[views.length - 1];
      expect(cellView.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ borderColor: Colors.accent })]));
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.accent })]),
      );
    });
  });

  // デザイン案「確定：カテゴリフィルタ「胸」適用（該当過去/未来・非該当過去/未来）」の仕様:
  // 該当日は通常通り塗りつぶし、非該当日は過去/未来問わず塗りつぶさずグレーの点のみ
  describe('カテゴリフィルター(activeFilter)の反映', () => {
    it('activeFilterがnull（絞り込みなし）なら実績がある日は通常通り塗りつぶされ、グレードットも付かない', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: null,
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['chest'])]]),
      });
      const touchable = findTouchableForDay(root, '7月5日');
      const cellView = touchable.findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
      const dot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === Colors.borderStrong);
      });
      expect(dot).toBeUndefined();
    });

    it('該当カテゴリを実施した日は通常通りカテゴリ色で塗りつぶされる（グレードットは付かない）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['chest', 'arm'])]]),
      });
      const touchable = findTouchableForDay(root, '7月5日');
      const cellView = touchable.findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
    });

    it('実績はあるが該当カテゴリを実施していない日は、塗りつぶさずグレードット(Colors.borderStrong)のみ表示する', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      const touchable = findTouchableForDay(root, '7月5日');
      const cellView = touchable.findAllByType(View)[0];
      // 塗りつぶし色は付かない
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
      // グレードットが表示される
      const dot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === Colors.borderStrong);
      });
      expect(dot).toBeDefined();
    });

    it('実績が全く無い日は、フィルターがかかっていてもグレードットを表示しない（未実施日と区別する）', () => {
      const root = render({
        activeFilter: 'chest',
        primaryCategoryByDay: new Map(),
        categorySetByDay: new Map(),
      });
      const touchable = findTouchableForDay(root, '7月5日');
      const cellView = touchable.findAllByType(View)[0];
      const dot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === Colors.borderStrong);
      });
      expect(dot).toBeUndefined();
    });

    it('フィルター対象外の日のaccessibilityLabelには「絞り込み対象外」を含む', () => {
      const root = render({
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toContain('絞り込み対象外');
    });

    it('フィルター対象内の日のaccessibilityLabelには「絞り込み対象外」を含まない', () => {
      const root = render({
        activeFilter: 'leg',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).not.toContain('絞り込み対象外');
    });

    it('前月/翌月セル(inCurrentMonthがfalse)はactiveFilter中でも通常のグレー表示のまま変化しない', () => {
      const root = render({
        activeFilter: 'chest',
        categorySetByDay: new Map(),
      });
      // 前月/翌月はそもそもPressableを持たない（既存仕様）ため、
      // 当月と同じ31件のまま増減しないことで前月/翌月セルが影響を受けていないことを確認する
      expect(root.root.findAllByType(Pressable)).toHaveLength(31);
    });
  });

  describe('予定データ(primaryCategoryByScheduleDay)の反映', () => {
    it('予定があり非選択の日はカテゴリ色のドットが付く（塗りつぶしはされない）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
      const dot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === getCalendarCategoryColor('chest'));
      });
      expect(dot).toBeDefined();
    });

    it('予定があり選択中の日は枠線が予定の代表カテゴリの色になる（デザイン案「確定：未来の日付を選択」通り）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 5),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'leg']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderColor: getCalendarCategoryColor('leg') })]),
      );
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
    });

    it('フィルター無しで実績と予定が両方ある日は実績（塗りつぶし）が優先され、予定ドットは出ない', () => {
      // フィルターが効いているケースは下の「実績と予定が併存する日のフィルター挙動」を参照。
      // このケース（activeFilter無し）では実績優先の表示は変わらないが、フィルターありだと
      // 実績が非該当なら予定側で該当扱いになりドットが出るケースがある点に注意
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'leg']]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
      const legDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === getCalendarCategoryColor('leg'));
      });
      expect(legDot).toBeUndefined();
    });

    it('予定がある日のaccessibilityLabelには「予定あり」とカテゴリ名を含む', () => {
      const root = render({ primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]) });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日、予定あり、胸');
    });

    it('予定も実績も無い日のaccessibilityLabelには「予定あり」も「実施日」も含まない', () => {
      const root = render();
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).toBe('7月5日');
    });

    it('カテゴリフィルターで非該当の予定はグレードットになる', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'leg']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      const dot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === Colors.borderStrong);
      });
      expect(dot).toBeDefined();
      const legDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === getCalendarCategoryColor('leg'));
      });
      expect(legDot).toBeUndefined();
    });

    it('予定が無い日は、フィルターがかかっていてもaccessibilityLabelに「絞り込み対象外」を含まない', () => {
      const root = render({
        activeFilter: 'chest',
        primaryCategoryByScheduleDay: new Map(),
        categorySetByScheduleDay: new Map(),
      });
      expect(findTouchableForDay(root, '7月5日').props.accessibilityLabel).not.toContain('絞り込み対象外');
    });
  });

  // 「実績があってもフィルター非該当なら、同じ日の予定が別カテゴリでフィルター該当していれば
  // ドットで見つけられるようにしたい」という要望に対応した排他解消ロジックのクロスケース。
  // 実績単体・予定単体のケースは上のdescribeで既にカバー済みのため、ここでは
  // 「実績と予定が同じ日に両方あり、かつフィルターがかかっている」組み合わせのみを扱う
  describe('実績と予定が併存する日のフィルター挙動', () => {
    it('実績がフィルター該当のときは、予定が別カテゴリで存在してもドットを一切出さない（塗りつぶし最優先）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['chest'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'leg']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('chest') })]),
      );
      const anyDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && (s.backgroundColor === Colors.borderStrong || s.backgroundColor === getCalendarCategoryColor('leg')));
      });
      expect(anyDot).toBeUndefined();
    });

    it('★実績がフィルター非該当、同じ日の予定が別カテゴリでフィルター該当なら、ドットが予定のカテゴリ色になる（グレーにならない）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['chest'])]]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      // 実績(leg)はフィルター非該当なので塗りつぶされない
      expect(cellView.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
      );
      // filterDotの基本スタイル自体は常にColors.borderStrongを内包している（配列の後ろの
      // 要素で上書きされる仕組みのため）ので、「borderStrongを持つViewが無いこと」ではなく
      // 「カテゴリ色のドットが1つだけ存在すること」を確認する
      const dotsWithColor = cellView.findAllByType(View).filter((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === getCalendarCategoryColor('chest'));
      });
      expect(dotsWithColor).toHaveLength(1);
    });

    it('実績がフィルター非該当、同じ日の予定も別カテゴリでフィルター非該当なら、従来通りグレードットのまま', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'arm']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['arm'])]]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      const grayDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === Colors.borderStrong);
      });
      expect(grayDot).toBeDefined();
      const armDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && s.backgroundColor === getCalendarCategoryColor('arm'));
      });
      expect(armDot).toBeUndefined();
    });

    it('選択中の日は、実績非該当・予定該当の組み合わせでもドットが一切出ない（枠線は実績カテゴリ色のまま）', () => {
      const root = render({
        selectedDate: new Date(2026, 6, 5),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['chest'])]]),
      });
      const cellView = findTouchableForDay(root, '7月5日').findAllByType(View)[0];
      expect(cellView.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderColor: getCalendarCategoryColor('leg') })]),
      );
      const anyDot = cellView.findAllByType(View).find((v) => {
        const style = [v.props.style].flat();
        return style.some((s) => s && (s.backgroundColor === Colors.borderStrong || s.backgroundColor === getCalendarCategoryColor('chest')));
      });
      expect(anyDot).toBeUndefined();
    });

    it('実績がフィルター非該当・予定が該当する日のaccessibilityLabelは「絞り込み対象外」を含まない（予定側で見つかるため）', () => {
      const root = render({
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['chest'])]]),
      });
      const label = findTouchableForDay(root, '7月5日').props.accessibilityLabel as string;
      expect(label).toContain('実施日、脚');
      expect(label).toContain('予定あり、胸');
      expect(label).not.toContain('絞り込み対象外');
    });

    it('実績が該当する日のaccessibilityLabelは、同じ日の予定が非該当でも「絞り込み対象外」を含まない', () => {
      const root = render({
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'chest']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['chest'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'leg']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['leg'])]]),
      });
      const label = findTouchableForDay(root, '7月5日').props.accessibilityLabel as string;
      expect(label).not.toContain('絞り込み対象外');
    });

    it('★今日×実績がフィルター非該当×予定が該当する日は、数字・下線バーはメインカテゴリ（実績側）の色のままになり、予定側の色には飛び火しない', () => {
      const root = render({
        today: new Date(2026, 6, 5),
        selectedDate: new Date(2026, 6, 18),
        activeFilter: 'chest',
        primaryCategoryByDay: new Map([['2026-07-05', 'leg']]),
        categorySetByDay: new Map([['2026-07-05', new Set(['leg'])]]),
        primaryCategoryByScheduleDay: new Map([['2026-07-05', 'chest']]),
        categorySetByScheduleDay: new Map([['2026-07-05', new Set(['chest'])]]),
      });
      // このケースは実績非該当・予定該当でドットも同時に表示されるため、単純に
      // 「最後に見つかったView」だと予定ドットを拾ってしまう。下線バー(height:2)と
      // ドット(height:5)はサイズが異なるので、それで区別する
      const views = findTouchableForDay(root, '7月5日').findAllByType(View);
      const underlineBar = views.find((v) => [v.props.style].flat().some((s) => s && s.height === 2))!;
      // 黒には落とさない（予定側がフィルターに該当しているため）
      expect(underlineBar.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.textBody })]),
      );
      // ただし色は実績(leg)のまま。予定(chest)の色にはならない
      expect(underlineBar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: getCalendarCategoryColor('leg') })]),
      );
    });
  });
});
