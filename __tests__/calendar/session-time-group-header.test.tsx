import { act, create } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { Colors } from '@/constants/theme';

function render(props: Partial<Parameters<typeof SessionTimeGroupHeader>[0]> = {}) {
  const merged = { sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(), ...props };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<SessionTimeGroupHeader {...merged} />);
  });
  return root;
}

describe('SessionTimeGroupHeader', () => {
  it('時間帯ラベルと時刻を"朝 07:10"のように表示する', () => {
    const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() });
    const label = root.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === '朝 07:10');
    expect(label).toBeDefined();
  });

  it('見出し全体にaccessibilityRole="header"とラベルが付く（アイコンとテキストが1要素として読み上げられる）', () => {
    const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() });
    const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
    expect(header).toBeDefined();
    expect(header.props.accessibilityLabel).toBe('朝 07:10');
    expect(header.props.accessible).toBe(true);
  });

  it.each([
    ['朝(7:10)', 'wb-sunny', 'timeOfDayMorning', new Date(2026, 6, 16, 7, 10).getTime()],
    // 昼は朝と同じアイコン(wb-sunny)を使い、色だけで区別する（ユーザー指示）
    ['昼(12:00)', 'wb-sunny', 'timeOfDayMidday', new Date(2026, 6, 16, 12, 0).getTime()],
    ['夕方(17:30)', 'wb-twilight', 'timeOfDayEvening', new Date(2026, 6, 16, 17, 30).getTime()],
    ['夜(21:00)', 'nightlight', 'timeOfDayNight', new Date(2026, 6, 16, 21, 0).getTime()],
  ] as const)('%sはsessionStartedAtから時間帯を導出し、%sアイコン・%sの色を使う', (_label, iconName, colorKey, sessionStartedAt) => {
    const root = render({ sessionStartedAt });
    const icon = root.root.findAllByProps({ name: iconName })[0];
    expect(icon).toBeDefined();
    expect(icon.props.color).toBe(Colors[colorKey as keyof typeof Colors]);
  });
});
