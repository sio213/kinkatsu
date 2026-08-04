import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { CommunityMessage } from '@/lib/workout/community-message';
import { StyleSheet, Text, View } from 'react-native';

/**
 * 反応アイコンの大きさ。ヘッダーの⋮（20px）より小さいのはデザイン案の指定で、
 * ♡・再抽選・⋮ の3つを本文より控えめな1行に収めるため。
 *
 * **Phase 2でタップ可能にするときは、この大きさのままでは44ptを大きく割る。**
 * 隣接するアイコンとの間隔（gap 6）も狭いので、hitSlopを素直に足すと当たり判定が重なる。
 * 配置ごと見直すこと
 */
const ICON_SIZE = 15;

/**
 * 完了サマリーの「みんなの声」。他ユーザーの応援メッセージを1件だけ表示する。
 *
 * ♡・再抽選・⋮ は**まだ何もしない**。投稿・通報・動画リワードによる差し替えは別Phaseで、
 * ここでは位置と余白だけを確定させている。押せないものを押せるように見せないため、
 * TouchableOpacityではなくただのアイコンとして置いている。
 *
 * **Phase 2で押せるようにする際は、下の `accessible` を必ず外すこと。** カードを1要素に
 * 畳んでいる今の形のままだと、各アイコンがスクリーンリーダーのフォーカス対象にならない。
 *
 * 残り回数のラベル（「あと2回」等）はサマリー本体には出さない。残数を見せるのは
 * 再抽選のモーダルの中だけ、という方針（デザイン案①）
 */
export function CommunityMessageCard({ message }: { message: CommunityMessage }) {
  return (
    <View
      style={styles.card}
      // 本文・投稿者名・いいね数が個別に読まれても意味を成さないため、カードで1つにまとめる
      accessible
      accessibilityLabel={`${message.author}からの応援メッセージ。${message.body}。いいね${message.likeCount}件`}
    >
      <Text style={styles.body}>{message.body}</Text>
      <View style={styles.meta}>
        <Text style={styles.author} numberOfLines={1}>
          {message.author}
        </Text>
        <View style={styles.action}>
          {/* デザイン案のアイコンは font-variation-settings:'FILL' 1 ＝塗り指定なので、
              中空のハートではなく塗りを使う */}
          <IconSymbol name="heart.fill" size={ICON_SIZE} color={Colors.textPlaceholder} />
          <Text style={styles.actionText}>{message.likeCount}</Text>
        </View>
        <IconSymbol name="arrow.clockwise" size={ICON_SIZE} color={Colors.textPlaceholder} />
        <IconSymbol name="ellipsis" size={ICON_SIZE} color={Colors.textPlaceholder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 角丸12・上下10左右12は、種目カード（角丸10・上下9左右10）より一回り緩い。デザイン案が
  // 意図的に分けている値で、種目カードに揃えないこと
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  // 投稿はUGCなので長さの上限を持たない。行数を絞らないのはデザイン案の複数行表示に合わせたもので、
  // 際限なく伸びるのを防ぐのは投稿側の文字数制限の仕事（Phase 2で決める）
  body: { ...Typography.communityMessageBody, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  // 投稿者名だけを伸縮させ、右のアイコン列は常に同じ位置に収める
  author: { ...Typography.communityMessageAuthor, color: Colors.textPlaceholder, flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actionText: { ...Typography.communityMessageAction, color: Colors.textMuted },
});
