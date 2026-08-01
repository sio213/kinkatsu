// 種目詳細・過去の記録は「タブ配下（タブバーあり）」と「ルートStack（タブバーなし）」の
// 2つのURLから同じ画面本体をマウントしている（CLAUDE.md「ナビゲーション・タブバーの表示範囲」）。
// 差は insideTabBar 1つだけで、これを取り違えるとSafeAreaの下辺がタブバーと二重になる／
// 足りなくなる。型でもテストでも守られていなかったので、4つのルートの対応をここで固定する。
/* eslint-disable no-var */
var mockDetailScreen: jest.Mock;
var mockHistoryScreen: jest.Mock;

jest.mock('@/components/exercises/exercise-detail-screen', () => {
  mockDetailScreen = jest.fn(() => null);
  return { ExerciseDetailScreen: mockDetailScreen };
});

jest.mock('@/components/exercises/exercise-history-screen', () => {
  mockHistoryScreen = jest.fn(() => null);
  return { ExerciseHistoryScreen: mockHistoryScreen };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import ExerciseDetailInLibraryRoute from '@/app/(tabs)/(library)/exercises/[id]';
import ExerciseHistoryInLibraryRoute from '@/app/(tabs)/(library)/exercises/history/[id]';
import ExerciseDetailRoute from '@/app/exercise/[id]';
import ExerciseHistoryRoute from '@/app/exercise/history/[id]';

function insideTabBarOf(Route: React.ComponentType, screen: jest.Mock) {
  screen.mockClear();
  act(() => {
    create(React.createElement(Route));
  });
  return screen.mock.calls[0][0].insideTabBar;
}

describe('種目詳細・過去の記録の2つのマウント先', () => {
  it('タブ配下のルートはタブバーがある前提でマウントする', () => {
    expect(insideTabBarOf(ExerciseDetailInLibraryRoute, mockDetailScreen)).toBe(true);
    expect(insideTabBarOf(ExerciseHistoryInLibraryRoute, mockHistoryScreen)).toBe(true);
  });

  it('ルートStackのルートはタブバーが無い前提でマウントする', () => {
    // 既定値(false)に任せているので、propとしては未指定で構わない
    expect(insideTabBarOf(ExerciseDetailRoute, mockDetailScreen)).toBeUndefined();
    expect(insideTabBarOf(ExerciseHistoryRoute, mockHistoryScreen)).toBeUndefined();
  });
});
