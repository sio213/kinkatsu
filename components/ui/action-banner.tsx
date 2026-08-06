import { Colors, Typography } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * アイコン＋タイトル＋本文＋アクションボタンの横並びバナー。
 * 「今この場で1つ決めてほしいこと」を、画面の流れを止めずに差し込むための器。
 *
 * 元はリマインダーの通知許可バナー（components/reminders/permission-banner.tsx）専用の
 * レイアウトだったものを、完了サマリーの「ルーティンとして保存」カード（デザイン案の.pbn＝
 * 「PermissionBanner準拠」と明記されている）が同じ寸法を要求したため共通化した。
 * 余白・角丸・ボタンサイズはどちらのデザイン案でも同値。
 *
 * toneは面の色だけを切り替える。warning=「放っておくと困る」、accent=「やると良いことがある」。
 */
type Tone = 'warning' | 'accent';

export type ActionBannerAction = {
  label: string;
  onPress: () => void;
  // 'primary'（塗りボタン）は各バナーに1つまでの想定。'text'は面を持たない副次アクション
  variant?: 'primary' | 'text';
  // 主ボタンのラベル左に置くアイコン（「設定を開く」の外部リンク記号など）
  icon?: ReactNode;
};

type Props = {
  tone: Tone;
  // アイコンの見た目（サイズ・色）は呼び出し側の責務。IconSymbolとDesignIconのどちらも渡せる
  icon: ReactNode;
  title: string;
  description?: string;
  actions: ActionBannerAction[];
};

export function ActionBanner({ tone, icon, title, description, actions }: Props) {
  const palette = PALETTES[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.title }]}>{title}</Text>
        {description != null && <Text style={[styles.desc, { color: palette.description }]}>{description}</Text>}
        <View style={styles.actions}>
          {actions.map((action) => {
            const isText = action.variant === 'text';
            return (
              <TouchableOpacity
                key={action.label}
                style={isText ? undefined : [styles.button, { backgroundColor: palette.button }]}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                // どちらのボタンもデザイン案の寸法では44ptに届かない（塗り33pt・文字16pt）。
                // レイアウトを変えずに当たり判定だけ広げる。左右を非対称にしているのは、
                // gap 14の内側で2つのヒットエリアが重ならないようにするため
                hitSlop={isText ? TEXT_BUTTON_HIT_SLOP : BUTTON_HIT_SLOP}
              >
                {!isText && action.icon}
                <Text style={isText ? [styles.textButtonLabel, { color: palette.textAction }] : styles.buttonLabel}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const PALETTES: Record<
  Tone,
  { surface: string; border: string; title: string; description: string; button: string; textAction: string }
> = {
  warning: {
    surface: Colors.warningSurface,
    border: Colors.warningBorder,
    title: Colors.warningText,
    description: Colors.warningText,
    button: Colors.warning,
    textAction: Colors.warningText,
  },
  accent: {
    surface: Colors.accentSurface,
    border: Colors.accentBorder,
    // 面がaccentSurfaceで十分に「青いブロック」と分かるため、文字まで色を付けない。
    // 本文中の他のカードと同じ字色にして読み負荷を上げない（デザイン案の--ink/--body）
    title: Colors.textPrimary,
    description: Colors.textBody,
    button: Colors.accent,
    // デザイン案は--muted(textMuted)だが、accentSurfaceの面では約4.38:1でAA(4.5:1)に
    // わずかに届かない。components/workout/set-row.tsxが同じ組み合わせを同じ理由で
    // 避けてtextSecondaryにしている前例に揃える（@reviewer指摘）
    textAction: Colors.textSecondary,
  },
};

const BUTTON_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };
const TEXT_BUTTON_HIT_SLOP = { top: 14, bottom: 14, left: 8, right: 8 };

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  // アイコンの光学中心をタイトルの1行目に合わせるための1pt（デザイン案の margin-top:1）
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 6 },
  title: { ...Typography.caption, fontWeight: '700' },
  desc: { ...Typography.caption },
  // marginTopの2ptは、gap6と合わせてボタン行だけ本文よりわずかに離すデザイン案の指定
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  buttonLabel: { ...Typography.caption, fontWeight: '700', color: Colors.onAccent },
  textButtonLabel: { ...Typography.caption, fontWeight: '600' },
});
