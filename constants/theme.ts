/**
 * デザイントークン。
 * Palette = 生の色値。Colors = 画面が参照する意味づけされたトークン。
 * ダークモードは未定なので、いまは light 相当の値のみを持つフラットな構成にしている。
 * 将来ダークモードをやるなら、その時に light/dark で出し分ける構造に戻す。
 */

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
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

  blue50: '#EFF6FF',
  blue600: '#2563EB',

  amber100: '#FEF3C7',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber800: '#92400E',

  red100: '#FEE2E2',
  red600: '#DC2626',
} as const;

export const Colors = {
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
};

/**
 * プッシュ画面共通のネイティブヘッダー設定（戻るアイコン最小表示・中央揃えタイトル・影なし）。
 * `<Stack screenOptions={headerOptions}>` に一度だけ渡し、各画面はtitle等の差分のみoptionsで指定する。
 * 戻るアイコンの色とタイトルの色を分けるため headerTintColor と headerTitleStyle.color を別々に指定している。
 */
export const headerOptions: NativeStackNavigationOptions = {
  headerBackButtonDisplayMode: 'minimal',
  headerTintColor: Colors.textPlaceholder,
  headerTitleAlign: 'center',
  headerTitleStyle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerShadowVisible: false,
  headerStyle: { backgroundColor: Colors.background },
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
