import { IconSymbol } from '@/components/ui/icon-symbol';
import { RecordListHeading } from '@/components/workout/record-list-heading';
import {
  EDIT_RECORD_HINT,
  RecordedExerciseCardList,
} from '@/components/workout/recorded-exercise-card-list';
import { Colors, Typography } from '@/constants/theme';
import type { RecordedExerciseCard } from '@/hooks/use-session-exercise-cards';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * 見出しの右端（件数）を、カードの chevron と縦に揃えるためのパディング。
 *
 * 値はカード自身の「内側パディング＋枠線」から決まる。ここが並べるのは
 * CalendarExerciseCard（padding 10・枠1）なので11。種目詳細の「過去の記録」が13なのは
 * あちらが並べる RecordSummaryCard の padding が12だからで、数字だけ写すとズレる
 */
const HEADING_RIGHT_PADDING = 11;

type Props = {
  /** 読み込み中はnull、取得失敗は'error' */
  cards: RecordedExerciseCard[] | 'error' | null;
  onPressExercise: (card: RecordedExerciseCard) => void;
  onRetry: () => void;
};

/**
 * 完了サマリーの種目一覧。カレンダーの選択日パネルと同じ種目カードを並べる。
 *
 * ✓が1つも付いていない種目も並べる。そのカードは「0セット」と出るので、実施していないことは
 * カード自身が語る。見出しを「実施した種目」ではなく「種目」にしているのはこのため
 * （実施していないものを含む以上、件数と「実施した」が食い違う。@ユーザー指摘）。
 *
 * この結果、見出しの件数は総重量など✓確定セットのみで集計した数値とは母数が異なる
 */
export function SummaryExerciseList({ cards, onPressExercise, onRetry }: Props) {
  // 読み込み中に「全0件」を出すと、種目が1件も無かったように一瞬見えてしまう
  if (cards === null) return null;

  // 取得失敗を無かったことにしない。数値もみんなの声も出ている画面なので、この枠だけ理由を出す。
  // 見出しを残すのは、セクションごと消えると「そもそも種目が無かった」と読めてしまうため
  if (cards === 'error') {
    return (
      <View style={styles.container}>
        <RecordListHeading label="種目" count={0} style={styles.heading} />
        <View style={styles.error}>
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color={Colors.danger} />
          <Text style={styles.errorText}>種目を読み込めませんでした</Text>
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RecordListHeading label="種目" count={cards.length} style={styles.heading} />
      {cards.length === 0 ? (
        // 記録編集で種目を全部消して戻ってくると到達する。見出しだけが浮くと
        // 「読み込みに失敗した」ようにも見えるので、空であることを明示する
        <Text style={styles.empty}>種目がありません</Text>
      ) : (
        <RecordedExerciseCardList
          cards={cards}
          onPressExercise={onPressExercise}
          accessibilityHint={EDIT_RECORD_HINT}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 見出しとカード列の間はブロック間(12px)より詰める。見出しは直下の一覧に属するため
  container: { gap: 8 },
  heading: { paddingRight: HEADING_RIGHT_PADDING },
  empty: { ...Typography.footnote, color: Colors.textMuted, paddingVertical: 8 },
  // エラー表示はカレンダーの選択日パネル（警告アイコン＋danger＋再試行）と同じ組み合わせに揃える
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  errorText: { ...Typography.footnote, color: Colors.danger, flex: 1 },
  retryText: { ...Typography.footnote, fontWeight: '700', color: Colors.accent },
});
