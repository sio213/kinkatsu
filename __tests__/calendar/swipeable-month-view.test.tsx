import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { SwipeableMonthView } from '@/components/calendar/swipeable-month-view';

const onSelectDate = jest.fn();
const onChangeMonth = jest.fn();

function render(props: Partial<Parameters<typeof SwipeableMonthView>[0]> = {}) {
  const merged = {
    year: 2026,
    month: 6, // 7月(0始まり)
    today: new Date(2026, 6, 18),
    selectedDate: new Date(2026, 6, 18),
    onSelectDate,
    onChangeMonth,
    primaryCategoryByDay: new Map<string, string>(),
    categorySetByDay: new Map<string, Set<string>>(),
    primaryCategoryByScheduleDay: new Map<string, string>(),
    categorySetByScheduleDay: new Map<string, Set<string>>(),
    activeFilter: null,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<SwipeableMonthView {...merged} />);
  });
  return root;
}

beforeEach(() => {
  onSelectDate.mockClear();
  onChangeMonth.mockClear();
});

describe('SwipeableMonthView', () => {
  // PR10-6の月送りちらつき修正(実機ログで原因特定)で、曜日ラベル行をMonthGrid内(3スロット分
  // 複製されスライドする)からこのコンポーネント側(スライドしない固定表示)へ引き上げた。
  // 複製されたままだと、ドラッグ中に隣接スロットの断片が繋がって「日月火水木金土日」のような
  // 本来ありえない並びに見える不具合があったため、常に1セットだけ・日曜始まりで描画されることを保証する
  it('曜日ラベル(日/月/火/水/木/金/土)は重複せず1セットだけ描画される', () => {
    const root = render();
    const labels = root.root
      .findAllByType(Text)
      .map((t) => t.props.children)
      .filter((c) => typeof c === 'string' && ['日', '月', '火', '水', '木', '金', '土'].includes(c));
    expect(labels).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });
});
