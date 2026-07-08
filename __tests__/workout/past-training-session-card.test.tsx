// past-training-session-card.tsxは@/lib/workout/history経由でpickPrimaryCategoryを使い、
// history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// history.test.ts/history-integration.test.tsと同じ理由でdb/client等は最小限モックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({
  exercises: {},
  sets: {},
  workoutSessionExercises: {},
  workoutSessions: {},
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
  ne: jest.fn(),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { PastTrainingSessionCard } from '@/components/workout/past-training-session-card';
import type { PastTrainingSession } from '@/lib/workout/history';

// formatRelativeDaysAgoは相対日付を返すため実時刻(Date.now())だとテスト実行日によって
// 表示が変わりflakyになる。sessionの2日後に固定する（history-entry-card.test.tsxと同じ対応）
const FIXED_NOW = new Date(2026, 6, 3, 12, 0, 0).getTime();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

const singleCategorySession: PastTrainingSession = {
  sessionId: 1,
  startedAt: new Date(2026, 6, 1, 10, 0).getTime(),
  exercises: [
    { exerciseId: 10, name: 'ベンチプレス', category: 'chest' },
    { exerciseId: 11, name: 'ダンベルフライ', category: 'chest' },
  ],
};

function render(session: PastTrainingSession = singleCategorySession) {
  const onPress = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<PastTrainingSessionCard session={session} onPress={onPress} />);
  });
  return { root: instance.root, onPress };
}

test('日付・カテゴリ・相対日付・種目名を表示する', () => {
  const { root } = render();
  expect(root.findByProps({ children: '7月1日（水）' })).toBeDefined();
  expect(root.findByProps({ children: '2日前' })).toBeDefined();
  expect(root.findByProps({ children: 'ベンチプレス・ダンベルフライ' })).toBeDefined();
});

test('6ヶ月前のセッションは相対日付として「6ヶ月前」を表示する', () => {
  const oldSession: PastTrainingSession = { ...singleCategorySession, startedAt: new Date(2026, 0, 4, 10, 0).getTime() };
  const { root } = render(oldSession);
  expect(root.findByProps({ children: '6ヶ月前' })).toBeDefined();
});

test('カテゴリが1種類だけの日は「ほか」を付けない', () => {
  const { root } = render();
  expect(root.findByProps({ children: '胸' })).toBeDefined();
  expect(() => root.findByProps({ children: '胸ほか' })).toThrow();
});

test('複数カテゴリの日は最も種目数が多いカテゴリに「ほか」を付けて表示する', () => {
  const session: PastTrainingSession = {
    sessionId: 2,
    startedAt: new Date(2026, 6, 1, 10, 0).getTime(),
    exercises: [
      { exerciseId: 10, name: 'ベンチプレス', category: 'chest' },
      { exerciseId: 11, name: 'ダンベルフライ', category: 'chest' },
      { exerciseId: 12, name: 'サイドレイズ', category: 'shoulder' },
    ],
  };
  const { root } = render(session);
  expect(root.findByProps({ children: '胸ほか' })).toBeDefined();
});

test('種目数が同数で並ぶ場合はCATEGORY_ORDERで先に来るカテゴリを代表にする', () => {
  // chestはbackよりCATEGORY_ORDERで先（胸/背中→肩→腕→脚→...）
  const session: PastTrainingSession = {
    sessionId: 3,
    startedAt: new Date(2026, 6, 1, 10, 0).getTime(),
    exercises: [
      { exerciseId: 10, name: 'ラットプルダウン', category: 'back' },
      { exerciseId: 11, name: 'ベンチプレス', category: 'chest' },
    ],
  };
  const { root } = render(session);
  expect(root.findByProps({ children: '胸ほか' })).toBeDefined();
});

test('同じ種目が複数カード（ウォームアップ+本番）あっても、種目名は重複表示しない', () => {
  const session: PastTrainingSession = {
    sessionId: 4,
    startedAt: new Date(2026, 6, 1, 10, 0).getTime(),
    exercises: [
      { exerciseId: 10, name: 'ベンチプレス', category: 'chest' },
      { exerciseId: 10, name: 'ベンチプレス', category: 'chest' },
    ],
  };
  const { root } = render(session);
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
});

test('カード全体が1つの読み上げ単位（accessibilityLabel）にまとまる', () => {
  const { root } = render();
  const card = root.findByProps({
    accessibilityLabel: '7月1日（水）、胸、2日前、ベンチプレス・ダンベルフライ',
  });
  expect(card).toBeDefined();
});

test('カードをタップするとsessionを渡してonPressを呼ぶ', () => {
  const { root, onPress } = render();
  act(() => {
    root.findByType(TouchableOpacity).props.onPress();
  });
  expect(onPress).toHaveBeenCalledWith(singleCategorySession);
});

test('右端に遷移を示すchevronを表示する', () => {
  const { root } = render();
  expect(root.findAllByType(Text).some((t) => t.props.children === '›')).toBe(true);
});

test('開始時刻は表示しない', () => {
  const { root } = render();
  expect(() => root.findByProps({ children: '10:00' })).toThrow();
});
