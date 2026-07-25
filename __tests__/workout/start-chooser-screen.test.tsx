const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import StartChooserScreen from '@/app/workout/start-chooser';

function findRowByLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === label);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(StartChooserScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  // pastDateKey無し = 今日の通常フロー（既存挙動）
  mockUseLocalSearchParams.mockReturnValue({});
});

// 2026-07-25にデザイン確定（「トレーニング開始選択画面 デザイン案.html」案06）。
// 未実装のプレースホルダー（おすすめメニュー・履歴から）を廃し、実装済みの3択の縦リストにした
test('3択の行を説明文つきで表示する', () => {
  const root = render();
  expect(root.findByProps({ children: '種目を追加' })).toBeDefined();
  expect(root.findByProps({ children: '好きな種目を選んで開始' })).toBeDefined();
  expect(root.findByProps({ children: 'ルーティン' })).toBeDefined();
  expect(root.findByProps({ children: '登録したメニューから開始' })).toBeDefined();
  expect(root.findByProps({ children: '過去の記録' })).toBeDefined();
  expect(root.findByProps({ children: '過去の履歴と同じ内容で開始' })).toBeDefined();
});

test('「おすすめメニュー」は表示しない（デザイン確定に伴い削除）', () => {
  const root = render();
  expect(() => root.findByProps({ children: 'おすすめメニュー' })).toThrow();
});

// 2026-07-25、@ユーザー指摘: 以前はここでセッションを作っていたため、子画面で「戻る」を押すと
// 空の記録がDBに残ってしまっていた。セッション作成は子画面の確定操作まで遅らせる
test('「種目を追加」をタップしてもセッションは作らず、newSession=1付きで種目追加ピッカーへ遷移するだけ', () => {
  const root = render();

  act(() => {
    findRowByLabel(root, '種目を追加')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-picker',
    params: { newSession: '1' },
  });
});

test('「ルーティン」をタップすると専用ピッカー画面(start-routine-picker)へ遷移する（pastDateKeyは付けない、2026-07-20: フルCRUD一覧app/routine/index.tsxから統一）', () => {
  const root = render();

  act(() => {
    findRowByLabel(root, 'ルーティン')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/workout/start-routine-picker', params: {} });
});

// 2026-07-25、要件確認済み: トレーニング画面ヘッダー⋮の「過去の記録から読み込み」と同じ画面へ送る
test('「過去の記録」をタップするとnewSession=1付きでsession-history-pickerへ遷移する', () => {
  const root = render();

  act(() => {
    findRowByLabel(root, '過去の記録')!.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/session-history-picker',
    params: { newSession: '1' },
  });
});

// カレンダー過去日パネル「記録を追加」から遷移してきた場合（2026-07-20）。pastDateKeyが
// 付いている間は、選んだ方法の結果が「トレーニング中」ではなく過去日の完了済みセッション
// （記録の編集モード）になる
describe('pastDateKeyモード（過去日の事後記録）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-07-25' });
  });

  test('タイトルに「記録を追加」と対象日をサブタイトルで表示する（@user-advisor指摘: 日付取り違え防止）', () => {
    const root = render();
    expect(root.findByProps({ children: '記録を追加' })).toBeDefined();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  });

  test('「種目を追加」はpastDateKeyを引き継いで種目追加ピッカーへ遷移する（作るセッションの種類は確定時に子画面が決める）', () => {
    const root = render();

    act(() => {
      findRowByLabel(root, '種目を追加')!.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/exercise-picker',
      params: { newSession: '1', pastDateKey: '2026-07-25' },
    });
  });

  test('「過去の記録」もpastDateKeyを引き継いでsession-history-pickerへ遷移する', () => {
    const root = render();

    act(() => {
      findRowByLabel(root, '過去の記録')!.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/session-history-picker',
      params: { newSession: '1', pastDateKey: '2026-07-25' },
    });
  });

  test('「ルーティン」をタップすると、pastDateKey付きで専用ピッカー画面(start-routine-picker)へ遷移する', () => {
    const root = render();

    act(() => {
      findRowByLabel(root, 'ルーティン')!.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/start-routine-picker',
      params: { pastDateKey: '2026-07-25' },
    });
  });

  // 2026-07-25、@ユーザー指摘: 過去日は「これから始める」のではなく「済んだトレーニングを
  // 後から記録する」操作のため、説明文の末尾を「開始」→「記録」に差し替える
  test('説明文の末尾が「記録」になる（今日の「開始」から差し替え）', () => {
    const root = render();
    expect(root.findByProps({ children: '好きな種目を選んで記録' })).toBeDefined();
    expect(root.findByProps({ children: '登録したメニューから記録' })).toBeDefined();
    expect(root.findByProps({ children: '過去の履歴と同じ内容で記録' })).toBeDefined();
    expect(() => root.findByProps({ children: '好きな種目を選んで開始' })).toThrow();
  });

  test('各行のVoiceOverヒントに対象日を補う（@designer指摘: 視覚的なサブタイトルだけでは伝わらないため）', () => {
    const root = render();
    expect(findRowByLabel(root, '種目を追加')!.props.accessibilityHint).toBe(
      '好きな種目を選んで記録。7月25日（土）の記録として追加します',
    );
  });

  test('不正なpastDateKeyの場合は日付が見つからない旨のエラー状態を表示する', () => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-13-99' });
    const root = render();
    expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  });
});
