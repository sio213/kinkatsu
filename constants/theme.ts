/**
 * デザイントークン。
 * Palette = 生の色値。Colors = 画面が参照する意味づけされたトークン。
 * ダークモードは未定なので、いまは light 相当の値のみを持つフラットな構成にしている。
 * 将来ダークモードをやるなら、その時に light/dark で出し分ける構造に戻す。
 */

import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
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
  slate900: '#0F172A',

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

  shadow: Palette.slate900,
};

/** シャドウトークン。各キーがスタイルオブジェクト。`{...Shadows.switchKnob}` のようにスプレッドして使う */
export const Shadows = {
  /** Switchのノブ（つまみ）に落とす影。0 1px 3px rgba(15,23,42,0.25)相当 */
  switchKnob: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
} as const;

/**
 * タイポグラフィトークン。役割ごとに基本{fontSize, lineHeight, fontWeight}を定義する
 * （sectionHeadingのletterSpacingのように役割固有の追加プロパティを持つものもある。badgeは単一行想定でlineHeightを持たない）。
 * 画面側はここを参照し、fontSizeを直書きしない（詳細はCLAUDE.md「タイポグラフィ・共通コンポーネント」参照）。
 * 既存箇所への適用は段階的に行うため、この定義自体は既存の見た目を変えない。
 */
export const Typography = {
  /** ネイティブヘッダーのタイトル（タブ画面・push画面共通） */
  navTitle: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  /** 種目名・セッション名などカードの主題テキスト */
  cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  /**
   * セクションラベル（「使う筋肉」等）。あえてbodyより小さい太字＋字間広めにした
   * Eyebrow/Overline見出し（本文の前に置く小さな道しるべ）。本文の代わりに使わないこと。
   */
  sectionHeading: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  /** 標準本文。フォーム入力・ボタン・Dropdownメニュー項目など「操作・確認する」テキスト全般 */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  /** ボタンラベル等、強調する本文 */
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  /**
   * ガイドなど、ユーザーがまとまった文章をじっくり読む箇所専用（「読み仮名(readings.ts)」とは無関係。
   * 命名衝突を避けるためreadingは使わない）。行間を広めにして読了体験を優先する。フォーム・ボタン等の
   * 操作系テキストにはbodyを使い、こちらは転用しない。
   */
  longform: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
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
   * デザイン案のセット入力欄(.setrow .cell)に合わせた値。タイマー表示だけはデザイン上
   * fontWeightが700のため、呼び出し側(app/workout/[id].tsx)で個別に上書きしている。
   */
  metric: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  /** NEW/BESTなどの小バッジ */
  badge: { fontSize: 11, fontWeight: '700' },
} as const;

/**
 * push画面・タブ画面で共通のヘッダーの見た目（中央揃えタイトル・影なし）。
 * native-stackとbottom-tabsはヘッダー関連オプションの型が別々（後者はheaderBackButtonDisplayModeを
 * 持たない）なので、値はここで一元管理しつつ`headerOptions`/`tabHeaderOptions`それぞれの型で
 * スプレッドして使う。
 */
const sharedHeaderStyle = {
  headerTintColor: Colors.textPlaceholder,
  headerTitleAlign: 'center' as const,
  headerTitleStyle: { ...Typography.navTitle, color: Colors.textPrimary },
  headerShadowVisible: false,
  headerStyle: { backgroundColor: Colors.background },
};

/**
 * プッシュ画面共通のネイティブヘッダー設定（戻るアイコン最小表示）。
 * `<Stack screenOptions={headerOptions}>` に一度だけ渡し、各画面はtitle等の差分のみoptionsで指定する。
 * 戻るアイコンの色とタイトルの色を分けるため headerTintColor と headerTitleStyle.color を別々に指定している。
 */
export const headerOptions: NativeStackNavigationOptions = {
  headerBackButtonDisplayMode: 'minimal',
  ...sharedHeaderStyle,
};

/**
 * タブ画面（記録・種目ライブラリ・リマインダー）共通のヘッダー設定。
 * Tabsナビゲータ自身のヘッダー（@react-navigation/bottom-tabs）が対象。
 * push画面はネイティブのUINavigationBarが右端に標準マージンを自動で入れるが、
 * bottom-tabsのヘッダーはJS実装で自動マージンを持たないため、headerRightContainerStyleで
 * 明示的に右端の余白を入れないとheaderRightのボタンが画面端に張り付いて見える。
 */
export const tabHeaderOptions: BottomTabNavigationOptions = {
  ...sharedHeaderStyle,
  headerRightContainerStyle: { paddingEnd: 16 },
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
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
