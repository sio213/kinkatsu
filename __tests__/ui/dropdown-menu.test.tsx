import { computeMenuPositionStyle } from '@/components/ui/dropdown-menu';
import { Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MINWIDTH = 160;

test('高さ未確定(menuHeight=null)の間は、はみ出さない前提でトリガーの下(top指定)を暫定的に返す', () => {
  // トリガーが画面最下部にあっても、まだ高さが分からない段階ではopensUpward判定をしない
  const style = computeMenuPositionStyle({ x: 10, y: SCREEN_HEIGHT - 10, width: 40, height: 20 }, null, MINWIDTH);

  expect(style.top).toBe(SCREEN_HEIGHT - 10 + 20 + 4);
  expect(style.bottom).toBeUndefined();
});

test('下に十分な余白がある場合、トリガーの下(top指定)に開く', () => {
  const anchor = { x: 10, y: 100, width: 40, height: 20 };
  const style = computeMenuPositionStyle(anchor, 150, MINWIDTH);

  expect(style.top).toBe(100 + 20 + 4); // anchor.y + anchor.height + MENU_GAP
  expect(style.bottom).toBeUndefined();
  expect(style.right).toBe(SCREEN_WIDTH - (10 + 40));
  expect(style.minWidth).toBe(MINWIDTH);
});

test('トリガーが画面下部にあり、下に開くと画面外にはみ出す場合はトリガーの上(bottom指定)に開き直す(バグ回帰防止)', () => {
  const triggerY = SCREEN_HEIGHT - 40; // 下の余白は40pt弱しか無い
  const anchor = { x: 10, y: triggerY, width: 40, height: 20 };
  const style = computeMenuPositionStyle(anchor, 200, MINWIDTH); // 余白より高いメニュー

  expect(style.bottom).toBe(SCREEN_HEIGHT - triggerY + 4); // SCREEN_HEIGHT - anchor.y + MENU_GAP
  expect(style.top).toBeUndefined();
});

test('下の余白がメニューの高さ以上ある場合は、トリガーが画面下部に近くても下開きのままにする', () => {
  const triggerY = SCREEN_HEIGHT - 300; // 下に約300ptの余白
  const anchor = { x: 10, y: triggerY, width: 40, height: 20 };
  const style = computeMenuPositionStyle(anchor, 100, MINWIDTH); // 余白より低いメニュー

  expect(style.top).toBe(triggerY + 20 + 4);
  expect(style.bottom).toBeUndefined();
});

test('境界値：メニューの高さ+余白が下の余白とちょうど一致する場合は下開きのまま(超過時のみ上開きにする)', () => {
  const spaceBelow = 50;
  const anchor = { x: 10, y: SCREEN_HEIGHT - spaceBelow, width: 40, height: 0 };
  const style = computeMenuPositionStyle(anchor, spaceBelow - 4, MINWIDTH); // menuHeight + MENU_GAP === spaceBelow

  expect(style.top).toBeDefined();
  expect(style.bottom).toBeUndefined();
});
