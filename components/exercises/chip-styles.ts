import { Colors, Typography } from '@/constants/theme';
import { StyleSheet } from 'react-native';

/**
 * チップ（絞り込み用の丸いボタン）の共通スタイル。
 *
 * - 標準（`chip` / `chipText`）… カテゴリ絞り込みチップ。横スクロールの中に文字幅で並ぶ
 * - 小（`chip` + `chipSmall` / `chipText` + `chipTextSmall`）… 期間チップ。1行に4つを等幅で
 *   並べるぶん一回り小さい。差分だけを持つので `[chipStyles.chip, chipStyles.chipSmall]` の
 *   ように標準の上に重ねて使う
 *
 * 選択状態（`chipActive` / `chipTextActive`）は大きさに関係なく共通。
 */
export const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSmall: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    // 等幅で並べるため、文字幅ではなく行の残り幅を分け合う
    flex: 1,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { ...Typography.footnote, color: Colors.textMuted, fontWeight: '500' },
  // 未選択の文字色は標準チップのtextMuted(slate500)より一段濃いtextSecondary(slate600)にする。
  // 小さいぶん可読性が落ちるため、surfaceSubtleの上で6.4:1（AA達成）になる値を使う
  chipTextSmall: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: Colors.onAccent },
});
