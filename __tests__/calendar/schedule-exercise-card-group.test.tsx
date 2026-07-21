import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ScheduleExerciseCardGroup, type ScheduleExerciseCardGroupCard } from '@/components/calendar/schedule-exercise-card-group';

const onPress = jest.fn();
const onDelete = jest.fn();
const onPressStart = jest.fn();
const onReplace = jest.fn();
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
    onDelete,
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
  onDelete.mockClear();
  onPressStart.mockClear();
  onReplace.mockClear();
  onRetryCards.mockClear();
});

// 予定（直接予定・ルーティン予定どちらも）の選択日パネル表示の見た目のみを担う共通コンポーネント
// （2026-07-21、旧DirectScheduleExerciseGroupから分割。データ取得は呼び出し元のコンテナが担う）
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

  it('⋮メニューの「削除」を押すとonDeleteが呼ばれる', () => {
    const root = render();
    const menuTrigger = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const deleteItem = findByAccessibilityLabel(root.root, '削除')!;
    act(() => {
      deleteItem.props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // onDeleteは実体化済み予定（直接予定・手動追加ルーティン予定）のときは呼び出し元
  // （scheduled-workout-exercise-group.tsx）が渡さないため、⋮メニュー自体が無くなる
  // （2026-07-22、@ユーザー指摘: 削除は遷移先のschedule-workout-edit.tsxに一本化）
  it('onDeleteを渡さない場合（実体化済み予定）、⋮メニュー自体が描画されない', () => {
    const root = render({ onDelete: undefined });
    expect(findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')).toBeUndefined();
  });

  // 呼び出し元の設計上あり得ない組み合わせだが、コンポーネント自身がonDelete優先で
  // ガードしていること（onDelete省略時はonReplaceだけ渡っていてもメニューが出ないこと）を
  // 保証しておく防御的テスト（@tester指摘）
  it('onDeleteを渡さずonReplaceだけ渡した場合でも⋮メニューは描画されない', () => {
    const root = render({ onDelete: undefined, onReplace });
    expect(findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')).toBeUndefined();
    expect(findByAccessibilityLabel(root.root, '今回だけ差し替え')).toBeUndefined();
  });

  it('onDeleteを渡さない場合でも見出し（時刻・routineName）は表示され続ける', () => {
    const root = render({ onDelete: undefined, routineName: '胸の日' });
    const texts = root.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts.some((t) => t.includes('19:30'))).toBe(true);
    expect(texts).toContain('胸の日');
  });

  it('onReplaceを渡さない場合（直接予定・実体化済みルーティン予定）、⋮メニューに「今回だけ差し替え」は出ない', () => {
    const root = render();
    const menuTrigger = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    expect(findByAccessibilityLabel(root.root, '今回だけ差し替え')).toBeUndefined();
  });

  it('onReplaceを渡す場合（未実体化のリマインダー予定）、⋮メニューに「今回だけ差し替え」が出てタップでonReplaceが呼ばれる', () => {
    const root = render({ onReplace });
    const menuTrigger = findByAccessibilityLabel(root.root, '「ベンチプレス 他1種目」夜 19:30のメニューを開く')!;
    act(() => {
      menuTrigger.props.onPress();
    });
    const replaceItem = findByAccessibilityLabel(root.root, '今回だけ差し替え')!;
    act(() => {
      replaceItem.props.onPress();
    });
    expect(onReplace).toHaveBeenCalledTimes(1);
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
