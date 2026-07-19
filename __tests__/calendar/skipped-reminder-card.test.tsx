import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SkippedReminderCard } from '@/components/calendar/skipped-reminder-card';

const onUndo = jest.fn();

function render(props: Partial<Parameters<typeof SkippedReminderCard>[0]> = {}) {
  const merged = {
    routineName: '胸の日',
    timeLabel: '今日 07:00',
    onUndo,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<SkippedReminderCard {...merged} />);
  });
  return root;
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

beforeEach(() => {
  onUndo.mockClear();
});

describe('SkippedReminderCard', () => {
  it('ルーティン名と「HH:MM・スキップ済み」キャプションを表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('胸の日');
    expect(texts).toContain('今日 07:00・スキップ済み');
  });

  it('「元に戻す」ボタンにルーティン名・時刻を含むaccessibilityLabelが付く', () => {
    const root = render();
    expect(findByAccessibilityLabel(root.root, '「胸の日」今日 07:00のスキップを元に戻す')).toBeDefined();
  });

  it('「元に戻す」を押すとonUndoが呼ばれる', () => {
    const root = render();
    act(() => {
      findByAccessibilityLabel(root.root, '「胸の日」今日 07:00のスキップを元に戻す')!.props.onPress();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('カード全体はタップ不可（「元に戻す」以外に意味のある遷移先が無いため、@designer方針）', () => {
    const root = render();
    // TouchableOpacityは「元に戻す」ボタンの1つだけで、カード全体を覆うものは無い
    expect(root.root.findAllByType(TouchableOpacity)).toHaveLength(1);
  });

  it('情報部分（ルーティン名・時刻・スキップ済み）は1つのaccessibilityLabelにまとめられ、VoiceOverの読み上げ単位が1ストップになる', () => {
    const root = render();
    const infoNode = root.root.findAllByProps({ accessible: true }).find((n) => n.props.accessibilityLabel);
    expect(infoNode?.props.accessibilityLabel).toBe('胸の日、今日 07:00、スキップ済み');
  });

  it('ルーティン名が異なっても正しく反映される', () => {
    const root = render({ routineName: '背中の日', timeLabel: '20:00' });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('背中の日');
    expect(texts).toContain('20:00・スキップ済み');
    expect(findByAccessibilityLabel(root.root, '「背中の日」20:00のスキップを元に戻す')).toBeDefined();
  });
});
