const mockDismissAll = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseWorkoutSession = jest.fn();
const mockUseSessionTotal = jest.fn();
const mockUseSessionWeekOrdinal = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissAll: mockDismissAll }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerTitle（タイトル＋日付サブタイトル）をテストで検証できるようレンダー関数だけ実行する
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) => {
      const { createElement, Fragment } = require('react');
      return createElement(Fragment, null, options?.headerTitle?.());
    },
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSession: (...args: unknown[]) => mockUseWorkoutSession(...args),
}));

// db/clientを経由してexpo-sqliteまで読み込まれるのを防ぐ（未モック環境では解決に失敗する）
jest.mock('@/hooks/use-session-summary', () => ({
  useSessionTotal: (...args: unknown[]) => mockUseSessionTotal(...args),
  useSessionWeekOrdinal: (...args: unknown[]) => mockUseSessionWeekOrdinal(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import WorkoutSummaryScreen from '@/app/workout/summary/[id]';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

/** レンダーされたTextの文字列（入れ子のTextは別要素として拾う）。propsの形に依存させないため */
function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().filter((c) => typeof c === 'string').join(''))
    .filter((s) => s.length > 0);
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(WorkoutSummaryScreen));
  });
  return instance.root;
}

const FIXED_START = new Date(2026, 7, 1, 19, 30, 0).getTime();
const session = { id: 1, startedAt: FIXED_START, endedAt: FIXED_START + 72 * 60_000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockUseWorkoutSession.mockReturnValue({ session, loaded: true });
  mockUseSessionTotal.mockReturnValue({ total: { label: '総重量', value: '12,450', unit: 'kg' } });
  mockUseSessionWeekOrdinal.mockReturnValue(2);
});

test('ヘッダーにタイトルとセッションの日付を表示する', () => {
  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['トレーニング完了', '8月1日（土）']));
});

test('数値3項目に所要時間・主役数値・今週N回目を表示する', () => {
  const root = render();

  // 72分は「1時間12分」に折り返す（formatSessionDurationLong）
  expect(texts(root)).toEqual(
    expect.arrayContaining(['時間', '1時間12分', '総重量', '12,450', 'kg', '今週', '2', '回目']),
  );
});

// セッションの中身によって2項目目の呼び名と単位が変わる（重量種目が無ければ合計回数など）
test('主役数値のラベルと単位はフックが返したものをそのまま出す', () => {
  mockUseSessionTotal.mockReturnValue({ total: { label: '合計回数', value: '84', unit: '回' } });

  const root = render();

  expect(texts(root)).toEqual(expect.arrayContaining(['合計回数', '84', '回']));
});

test('主役数値が組み立てられない場合はダッシュを出す', () => {
  mockUseSessionTotal.mockReturnValue({ total: null });

  const root = render();

  expect(texts(root)).toContain('—');
});

// 未解決（undefined）で「—」や「0回目」を描くと、開くたびに一瞬それが見えてから実値に切り替わる。
// 終了直後のセッションが「今週0回目」になることは論理的にありえない
test('集計が未解決のうちはダッシュも0回目も描かない', () => {
  mockUseSessionTotal.mockReturnValue({ total: undefined });
  mockUseSessionWeekOrdinal.mockReturnValue(undefined);

  const root = render();

  expect(texts(root)).not.toContain('—');
  expect(texts(root)).not.toContain('0');
  // 所要時間はセッションから直接出せるので、未解決でも表示されている
  expect(texts(root)).toContain('1時間12分');
});

// ラベルと数値が別々の要素として読まれると対応が付かない
test('数値3項目はセル単位で1つの読み上げにまとまる', () => {
  const root = render();

  const labels = root
    .findAllByProps({ accessible: true })
    .map((n: ReactTestInstance) => n.props.accessibilityLabel)
    .filter((l: unknown): l is string => typeof l === 'string');
  expect(labels).toEqual(
    expect.arrayContaining(['時間 1時間12分', '総重量 12,450kg', '今週 2回目']),
  );
});

test('「閉じる」を押すとrouter.dismissAllで元いたタブまで畳む', () => {
  const root = render();

  act(() => {
    findButtonByLabel(root, '閉じる')!.props.onPress();
  });

  expect(mockDismissAll).toHaveBeenCalled();
});

// 記録編集画面の⋮「削除」は deleteSession → router.back() なので、サマリーから開いていると
// 削除済みセッションのサマリーへ戻ってくる。そのまま留まらせず即座に畳む
test('セッションが削除されている場合はそのままタブまで畳む', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: true });

  render();

  expect(mockDismissAll).toHaveBeenCalled();
});

// useWorkoutSessionのdataは解決前から[]なので、loadedを見ないとマウント直後に必ず畳んでしまう
test('読み込み中（loaded=false）はまだ畳まない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });

  render();

  expect(mockDismissAll).not.toHaveBeenCalled();
});

test('idが数値でない場合もタブまで畳む', () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });

  render();

  expect(mockDismissAll).toHaveBeenCalled();
});
