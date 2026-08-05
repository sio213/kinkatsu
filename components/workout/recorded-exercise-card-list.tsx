import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import type { RecordedExerciseCard } from '@/hooks/use-session-exercise-cards';
import { StyleSheet, View } from 'react-native';

// カレンダーの選択日パネル（今日・過去日）と完了サマリーの種目一覧で共通の文言。
// 同じ文言を各所に手打ちするとコピペでの食い違いが起きるため1箇所に集約する（@reviewer指摘）
export const EDIT_RECORD_HINT = 'タップして記録を編集します';

type Props = {
  cards: RecordedExerciseCard[];
  // 遷移先はカード自身では決めず呼び出し元に委ねる。カレンダーは記録編集画面、
  // 完了サマリーも記録編集画面だが、押したカードを使うかどうかが違う
  onPressExercise: (card: RecordedExerciseCard) => void;
  // 遷移先の説明。呼び出し元は現状すべてEDIT_RECORD_HINTを渡すが、将来パネルごとに
  // 文言を変える余地を残すため引数のままにしている（@designer指摘）
  accessibilityHint: string;
};

/**
 * 記録済みの種目カードを縦に並べる列。カレンダーの選択日パネルと完了サマリーで共有する。
 *
 * CalendarExerciseCardへ渡すpropsは11個あり、詰め替えを各画面に置くと1つ増やすたびに
 * 全箇所を直すことになる（同じ理由で一度カレンダー内で共通化した経緯がある）ため、
 * ここ1箇所に集約する
 */
export function RecordedExerciseCardList({ cards, onPressExercise, accessibilityHint }: Props) {
  return (
    <View style={styles.list}>
      {cards.map((card) => (
        <CalendarExerciseCard
          key={card.workoutSessionExerciseId}
          exerciseId={card.exerciseId}
          name={card.name}
          category={card.category}
          source={card.source}
          slug={card.slug}
          measurementType={card.measurementType}
          sets={card.sets}
          isBest={card.isBest}
          comparison={card.comparison}
          onPress={() => onPressExercise(card)}
          accessibilityHint={accessibilityHint}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
});
