import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
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

  describe('isSchedule（今日パネルで実績と予定を混在表示する場合）', () => {
    it('isSchedule未指定(false)なら「予定」ラベルを表示しない', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime() });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).not.toContain('予定');
    });

    it('isSchedule=trueなら時刻ラベルに加えて控えめな「予定」ラベルを表示する', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime(), isSchedule: true });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).toContain('夜 20:00');
      expect(texts).toContain('予定');
    });

    it('isSchedule=trueならaccessibilityLabelにも「予定」を含む', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime(), isSchedule: true });
      const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
      expect(header.props.accessibilityLabel).toBe('夜 20:00、予定');
    });
  });

  // ルーティン紐付き予定の見出し右端にルーティン名を表示する
  // （デザイン案「複数18: 時間帯アイコン（朝・夕方・夜）」＝アイコン・時刻・余白・ルーティン名の順、
  // 2026-07-22に左端→右端へ変更）
  describe('routineName（ルーティン紐付き予定の見出し右端に表示）', () => {
    it('routineName未指定なら何も表示しない（直接予定・実績セッション側の従来挙動を維持）', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).not.toContain('胸の日');
    });

    it('routineNameを渡すと時刻ラベルより後（右端）に表示される', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(), routineName: '胸の日' });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).toContain('胸の日');
      expect(texts.indexOf('胸の日')).toBeGreaterThan(texts.indexOf('朝 07:10'));
    });

    it('routineNameを渡すとaccessibilityLabelの末尾に含まれる', () => {
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime(),
        routineName: '胸の日',
        isSchedule: true,
      });
      const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
      expect(header.props.accessibilityLabel).toBe('夜 20:00、予定、胸の日');
    });

    it('長いルーティン名でも1行に収まるようnumberOfLines={1}が指定される', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(), routineName: '胸・肩・二頭の日' });
      const nameText = root.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === '胸・肩・二頭の日')!;
      expect(nameText.props.numberOfLines).toBe(1);
    });

    // デザイン案通り、時刻ラベルは常に主要情報として太字のまま、ルーティン名は一段控えめな
    // トーン（caption/muted）にする（2026-07-22、routineNameの有無で時刻側のウェイトを
    // 変える旧仕様は廃止）
    it('routineNameの有無にかかわらず、時刻ラベルは太字(fontWeight:700)のまま', () => {
      const withName = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(), routineName: '胸の日' });
      const withoutName = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() });
      const flattenStyle = (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style);
      const timeTextWithName = withName.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === '朝 07:10')!;
      const timeTextWithoutName = withoutName.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === '朝 07:10')!;
      expect(flattenStyle(timeTextWithName.props.style).fontWeight).toBe('700');
      expect(flattenStyle(timeTextWithoutName.props.style).fontWeight).toBe('700');
    });

    it('routineNameは時刻ラベルより控えめなスタイル(fontWeight:600、textMuted)になる', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(), routineName: '胸の日' });
      const nameText = root.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === '胸の日')!;
      const flattenStyle = (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style);
      expect(flattenStyle(nameText.props.style).fontWeight).toBe('600');
      expect(flattenStyle(nameText.props.style).color).toBe(Colors.textMuted);
    });
  });

  // 今日自身の予定にのみ呼び出し元(schedule-exercise-card-group.tsx)が渡す「開始」ボタン。
  // 種目一覧の下ではなく見出し右端に表示する（2026-07-23、デザイン案「今日01」準拠）
  describe('onPressStart（見出し右端の「開始」ボタン）', () => {
    it('onPressStart未指定（未来日の予定）なら「開始」ボタンを表示しない', () => {
      const root = render({ sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).not.toContain('開始');
    });

    it('onPressStartを渡す（今日自身の予定）と「開始」ボタンを表示し、タップでonPressStartが呼ばれる', () => {
      const onPressStart = jest.fn();
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
        onPressStart,
        startAccessibilityLabel: '「ベンチプレス 他1種目」朝 07:10のトレーニングを開始',
      });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts).toContain('開始');
      const button = root.root
        .findAllByType(TouchableOpacity)
        .find((t) => t.props.accessibilityLabel === '「ベンチプレス 他1種目」朝 07:10のトレーニングを開始')!;
      expect(button).toBeDefined();
      act(() => {
        button.props.onPress();
      });
      expect(onPressStart).toHaveBeenCalledTimes(1);
    });

    it('routineNameとonPressStartを両方渡すと、ルーティン名は開始ボタンより前（時刻情報側）に表示される', () => {
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
        routineName: '胸の日',
        onPressStart: jest.fn(),
      });
      const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
      expect(texts.indexOf('胸の日')).toBeLessThan(texts.indexOf('開始'));
    });

    // 今日パネルの実運用（schedule-exercise-card-group.tsx）はisSchedule/routineName/onPressStartを
    // 常に同時に渡すため、その組み合わせでもaccessibilityLabelが正しく組み立つことを確認する
    // （@tester指摘: 個々のprop単体のテストだけでは実際の呼び出しパターンを網羅できていなかった）
    it('isSchedule・routineName・onPressStartを同時に渡す（実運用と同じ組み合わせ）と、見出しのaccessibilityLabelにすべて含まれる', () => {
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime(),
        isSchedule: true,
        routineName: '胸の日',
        onPressStart: jest.fn(),
        startAccessibilityLabel: '「胸の日」夜 20:00のトレーニングを開始',
      });
      const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
      expect(header.props.accessibilityLabel).toBe('夜 20:00、予定、胸の日');
    });

    // アクセシビリティ構造の核心：開始ボタンはaccessible=trueの見出しView配下に無く、兄弟要素として
    // 独立していなければならない（そうでないとVoiceOver/TalkBackがボタンを個別要素として読み上げ・
    // 操作できなくなる）。findAllByTypeによるツリー全体探索のテストだけでは、開始ボタンを誤って
    // header配下に戻す退行を検知できないため、構造そのものを検証する（@tester指摘）
    it('開始ボタンはaccessible=trueの見出しView配下に含まれない（VoiceOver/TalkBackで個別要素として操作できるようにするため）', () => {
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
        onPressStart: jest.fn(),
      });
      const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
      expect(header.findAllByType(TouchableOpacity)).toHaveLength(0);
    });

    // 開始ボタン自身のaccessibilityLabelが見出し側のaccessibilityLabelに混入していないことを確認する。
    // 混入していると、見出し全体をVoiceOverで読み上げたときに「開始」の情報が二重に読まれたり、
    // ボタンのラベルが親に吸収されて見出しの読み上げ内容が意図と変わってしまう（@tester指摘）
    it('開始ボタンのaccessibilityLabelは見出し(header)側のaccessibilityLabelに混入しない', () => {
      const root = render({
        sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
        onPressStart: jest.fn(),
        startAccessibilityLabel: '「胸の日」朝 07:10のトレーニングを開始',
      });
      const header = root.root.findAllByType(View).find((v) => v.props.accessibilityRole === 'header')!;
      expect(header.props.accessibilityLabel).not.toContain('開始');
    });
  });
});
