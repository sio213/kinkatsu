import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ScheduleExerciseCardGroup, type ScheduleExerciseCardGroupCard } from '@/components/calendar/schedule-exercise-card-group';

const onPress = jest.fn();
const onPressStart = jest.fn();
const onRetryCards = jest.fn();

const benchPressCard: ScheduleExerciseCardGroupCard = {
  key: '200',
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  source: 'preset',
  slug: 'bench_press',
  measurementType: 'weight_reps',
  sets: [],
};

function render(props: Partial<Parameters<typeof ScheduleExerciseCardGroup>[0]> = {}) {
  const merged = {
    sessionStartedAt: new Date(2026, 6, 25, 19, 30).getTime(),
    title: 'ベンチプレス 他1種目',
    cards: [benchPressCard],
    onPress,
    ...props,
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<ScheduleExerciseCardGroup {...merged} />);
  });
  return root;
}

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

beforeEach(() => {
  onPress.mockClear();
  onPressStart.mockClear();
  onRetryCards.mockClear();
});

// 予定（直接予定・ルーティン予定どちらも）の選択日パネル表示の見た目のみを担う共通コンポーネント
// （2026-07-21、旧DirectScheduleExerciseGroupから分割。データ取得は呼び出し元のコンテナが担う）。
// ⋮メニュー（削除・今回だけ差し替え）は2026-07-22に全種別で撤去した（@ユーザー指摘）
describe('ScheduleExerciseCardGroup', () => {
  it('cardsを種目名付きで表示し、まだ実施していないため自己ベストバッジは出さない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
    expect(texts).not.toContain('自己ベスト');
  });

  it('種目カードをタップすると、種目idを問わずonPressが呼ばれる', () => {
    const root = render();
    const card = root.root
      .findAllByType(TouchableOpacity)
      .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
    act(() => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cardsがnull（読み込み中）のときは種目カードを表示しない（クラッシュしない）', () => {
    const root = render({ cards: null });
    expect(root.root.findAllByProps({ children: 'ベンチプレス' })).toHaveLength(0);
  });

  it('cardsがnull（読み込み中）のときは「種目を追加」の空状態も表示しない（読み込み中と本当に0件を混同しない）', () => {
    const root = render({ cards: null });
    expect(root.root.findAllByProps({ children: '種目を追加' })).toHaveLength(0);
  });

  // ルーティン削除等で種目が0件になった予定（極めて稀なレース条件）が、見出しだけ残り
  // 何もタップできない状態になっていたバグの修正（ユーザー報告、2026-07-22）。空状態の見た目は
  // ルーティン編集フォーム等と同じRoutineAddExerciseButton(variant="compact")を共有する
  // （2026-07-22、デザイン案「未来（予定）／種目0件」準拠に@ユーザー指摘で統一）
  it('cardsが読み込み済みで0件のときは「種目を追加」の空状態を表示し、タップするとonPressが呼ばれる', () => {
    const root = render({ cards: [] });
    expect(root.root.findByProps({ children: '種目を追加' })).toBeDefined();
    const emptyRow = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30に種目を追加')!;
    act(() => {
      emptyRow.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("cardsが'error'かつonRetryCardsが渡されているときはエラー文言と再試行ボタンを表示し、押すとonRetryCardsが呼ばれる", () => {
    const root = render({ cards: 'error', onRetryCards });
    expect(root.root.findByProps({ children: '種目を読み込めませんでした' })).toBeDefined();

    const retryBtn = findByAccessibilityLabel(root.root, '再試行')!;
    act(() => {
      retryBtn.props.onPress();
    });
    expect(onRetryCards).toHaveBeenCalledTimes(1);
  });

  it("cardsが'error'でもonRetryCardsが渡されていなければ再試行UIを表示しない（'error'状態を持たない呼び出し元向け）", () => {
    const root = render({ cards: 'error' });
    expect(() => root.root.findByProps({ children: '種目を読み込めませんでした' })).toThrow();
  });

  it('一度も実施したことが無い種目（sets空）は「実施記録なし」と表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('実施記録なし');
    expect(texts).not.toContain('0セット');
  });

  it('⋮メニューは表示されない（削除・差し替えは廃止済み）', () => {
    const root = render();
    expect(findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')).toBeUndefined();
  });

  it('onPressStartを渡さない場合（未来日）、開始ボタンは表示されない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('開始');
  });

  it('onPressStartを渡す場合（今日自身の予定）、開始ボタンが表示されタップでonPressStartが呼ばれる', () => {
    const root = render({ onPressStart });
    const startBtn = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のトレーニングを開始')!;
    act(() => {
      startBtn.props.onPress();
    });
    expect(onPressStart).toHaveBeenCalledTimes(1);
  });

  // ルーティン紐付き予定のときだけ呼び出し元が渡す（2026-07-21）。SessionTimeGroupHeaderへ橋渡しする
  it('routineNameを渡すと見出しに表示される（SessionTimeGroupHeaderへ橋渡し）', () => {
    const root = render({ routineName: '胸の日' });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('胸の日');
  });

  it('routineNameを渡さない場合（直接予定）、見出しにルーティン名は表示されない', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).not.toContain('胸の日');
  });
});
