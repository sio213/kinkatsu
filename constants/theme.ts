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
 * タイポグラフィトークン。役割ごとに基本{fontSize, lineHeight, fontWeight}を定義する
 * （sectionHeadingのletterSpacingのように役割固有の追加プロパティを持つものもある。badgeは単一行想定でlineHeightを持たない）。
 * 画面側はここを参照し、fontSizeを直書きしない（詳細はCLAUDE.md「タイポグラフィ・共通コンポーネント」参照）。
 * 既存箇所への適用は段階的に行うため、この定義自体は既存の見た目を変えない。
 */
export const Typography = {
  /**
   * タブ画面のH1（「記録」「種目ライブラリ」等）。
   * 将来タブ画面にもpush画面と同じデザインのヘッダーを追加したら、この役割は無くなりnavTitleに一本化する想定。
   */
  screenTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  /** push画面のネイティブヘッダー・疑似ヘッダー */
  navTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  /** 種目名・セッション名などカードの主題テキスト */
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  /**
   * セクションラベル（「使う筋肉」等）。あえてbodyより小さい太字＋字間広めにした
   * Eyebrow/Overline見出し（本文の前に置く小さな道しるべ）。本文の代わりに使わないこと。
   */
  sectionHeading: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.2 },
  /** 標準本文。フォーム入力・ボタン・Dropdownメニュー項目など「操作・確認する」テキスト全般 */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  /** ボタンラベル等、強調する本文 */
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  /**
   * ガイドなど、ユーザーがまとまった文章をじっくり読む箇所専用（「読み仮名(readings.ts)」とは無関係。
   * 命名衝突を避けるためreadingは使わない）。行間を広めにして読了体験を優先する。フォーム・ボタン等の
   * 操作系テキストにはbodyを使い、こちらは転用しない。
   */
  longform: { fontSize: 16, lineHeight: 25, fontWeight: '400' },
  /** やや大きめの補助テキスト（エラーメッセージ・チップ文言・要約1行など）。fontWeightは用途に応じ都度上書きしてよい */
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /**
   * 最小の一般テキスト（相対日付・件数・列見出しラベルなど）。fontWeightは用途に応じ都度上書きしてよい
   * （前身のmetricLabelトークンをここに統合したため、太字での使用頻度が高い）。
   */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /**
   * トレーニング中に一瞬で読む太字の数値（重量・回数の入力欄、タイマー表示など）。
   * 前身のtimerトークンをここに統合したため、役割は「重要な数値」全般を指す。
   */
  metric: { fontSize: 17, lineHeight: 20, fontWeight: '700' },
  /** NEW/BESTなどの小バッジ */
  badge: { fontSize: 11, fontWeight: '700' },
} as const;

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
