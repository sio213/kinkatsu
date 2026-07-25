import { DesignIcon, type DesignIconName } from '@/components/ui/design-icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  /**
   * 中央の丸バッジに入れるアイコン。空になっている対象そのものを表すものを選ぶ
   * （ルーティン=repeat・過去の記録=history）。StartMethodRowと同じ理由でIconSymbolではなく
   * Material SymbolsのパスDesignIconを使い、開始選択画面の3択と同じ字形に揃える
   */
  icon: DesignIconName;
  /** 「ルーティンがまだありません」など、何が無いかを言い切る1行 */
  title: string;
  /** 埋まると何が嬉しいかの補足。改行位置はデザイン案通りに呼び出し側が`\n`で決める */
  description: string;
  /**
   * 空を埋めるための主CTA。「ルーティンを作成」のようにその場で作れる画面と、
   * 「新しく記録する」のように他の手段へ逃がす画面がある。作る手段自体を持たない
   * 呼び出し元（ルーティン編集からの履歴読み込み等）では省略でき、その場合は「戻る」だけになる
   */
  action?: { label: string; icon: DesignIconName; onPress: () => void };
  /**
   * 「戻る」を押したときの遷移。タブ直下の一覧（記録タブのルーティン一覧など）は戻る先が無いため
   * 省略する。フロー内のピッカー画面では必ず渡す
   */
  onPressBack?: () => void;
};

/**
 * 「0件」の空状態（デザイン案「トレーニング開始選択画面 デザイン案.html」の06-b′/06-c′）。
 * アイコン中央＋タイトル＋説明＋主CTA＋「戻る」の型で、0件の画面すべてを揃える。
 *
 * NotFoundState（components/ui/not-found-state.tsx）との使い分け:
 * あちらは「見つからない・読み込めなかった」＝異常系で、ユーザーに次の一手が無いため
 * 装飾を持たないテキスト＋単一ボタン。こちらは「まだ空なだけ」＝正常系の初期状態で、
 * 空を埋める導線を主CTAとして提示する。取得失敗（再試行）にこちらを流用しないこと。
 */
export function EmptyState({ icon, title, description, action, onPressBack }: Props) {
  return (
    <View style={styles.body}>
      {/* アイコンは装飾でタイトルが同じ意味を持つため、VoiceOverの読み上げ対象から外す */}
      <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <DesignIcon name={icon} size={30} color={Colors.accent} />
      </View>
      {/* VoiceOverのローターで見出しとして拾えるようにする（@designer指摘） */}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      {action && (
        <PrimaryButton
          label={action.label}
          onPress={action.onPress}
          style={styles.action}
          icon={<DesignIcon name={action.icon} size={18} color={Colors.onAccent} />}
        />
      )}
      {onPressBack &&
        (action ? (
          // 主CTAがあるときの「戻る」はデザイン案通りの控えめなゴースト表現。主CTAより
          // 目立たせないことが目的なので、こちらは塗りボタンにしない
          <TouchableOpacity
            onPress={onPressBack}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="戻る"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>戻る</Text>
          </TouchableOpacity>
        ) : (
          // 主CTAが無い経路（ルーティン編集・予定作成からの履歴読み込み等）では「戻る」が唯一の
          // 操作要素になる。ゴーストのままだと情報量の多い上部に対して下部が弱く、押せる要素が
          // どれか分かりにくいため塗りボタンにする（@designer指摘。NotFoundStateの単一ボタンと同じ扱い）
          <PrimaryButton label="戻る" onPress={onPressBack} style={styles.action} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // デザイン案は16px/700だが、16pxはタイポスケールにロールが割り当てられていないため
  // 最も近いcardTitle(15/22/700)へ寄せる（foundations「アプリ内タイポ準拠表」の指示）
  title: { ...Typography.cardTitle, color: Colors.textPrimary, textAlign: 'center' },
  description: { ...Typography.footnote, color: Colors.textMuted, textAlign: 'center' },
  // PrimaryButtonは全幅前提で左右paddingを持たないため、中央寄せの自動幅ボタンとして
  // デザイン案の左右22ptを足す（上下はアプリ共通のPrimaryButtonの値をそのまま使う）
  action: { alignSelf: 'center', paddingHorizontal: 22, marginTop: 2 },
  back: { padding: 6 },
  // デザイン案は13.5px/600。13.5はスケール外のためfootnote(13)へ寄せ、太さのみ上書きする
  backText: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted },
});
