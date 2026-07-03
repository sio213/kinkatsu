/**
 * デザイントークン。
 * Palette = 生の色値。Colors = 画面が参照する意味づけされたトークン。
 * 現時点では light の値を実画面の色に合わせているだけで、見た目は変更していない。
 * dark はまだ実画面に配線されていない（タブバー/ナビゲーションのクロムのみ）ので、
 * 将来ダークモードを実装する際にこのキー構成のまま値を磨き込む想定。
 */

import { Platform } from 'react-native';

const Palette = {
  white: '#FFFFFF',

  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  blue50: '#EFF6FF',
  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue800: '#1E3A8A',

  amber100: '#FEF3C7',
  amber200: '#FDE68A',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber800: '#92400E',
  amber900: '#78350F',

  red100: '#FEE2E2',
  red400: '#F87171',
  red600: '#DC2626',
  red900: '#7F1D1D',
} as const;

export const Colors = {
  light: {
    background: Palette.white,
    surface: Palette.white,
    surfaceMuted: Palette.slate50,
    surfaceSubtle: Palette.slate100,

    border: Palette.slate200,
    borderStrong: Palette.slate300,

    text: Palette.slate800,
    textPrimary: Palette.slate800,
    textBody: Palette.slate700,
    textSecondary: Palette.slate600,
    textMuted: Palette.slate500,
    textPlaceholder: Palette.slate400,

    accent: Palette.blue600,
    accentSurface: Palette.blue50,
    onAccent: Palette.white,

    favorite: Palette.amber500,

    danger: Palette.red600,
    dangerSurface: Palette.red100,

    warning: Palette.amber600,
    warningAccent: Palette.amber500,
    warningText: Palette.amber800,
    warningSurface: Palette.amber100,

    icon: Palette.slate500,
    tabIconDefault: Palette.slate500,
    tabIconSelected: Palette.blue600,
    tint: Palette.blue600,
  },
  dark: {
    background: Palette.slate900,
    surface: Palette.slate800,
    surfaceMuted: Palette.slate800,
    surfaceSubtle: Palette.slate700,

    border: Palette.slate700,
    borderStrong: Palette.slate600,

    text: Palette.slate100,
    textPrimary: Palette.slate100,
    textBody: Palette.slate200,
    textSecondary: Palette.slate300,
    textMuted: Palette.slate400,
    textPlaceholder: Palette.slate500,

    accent: Palette.blue500,
    accentSurface: Palette.blue800,
    onAccent: Palette.white,

    favorite: Palette.amber400,

    danger: Palette.red400,
    dangerSurface: Palette.red900,

    warning: Palette.amber400,
    warningAccent: Palette.amber400,
    warningText: Palette.amber200,
    warningSurface: Palette.amber900,

    icon: Palette.slate400,
    tabIconDefault: Palette.slate400,
    tabIconSelected: Palette.blue500,
    tint: Palette.blue500,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
