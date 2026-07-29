import { ExerciseRecordCard } from '@/components/exercises/exercise-record-card';
import { DesignIcon } from '@/components/ui/design-icon';
import { RecordListHeading } from '@/components/workout/record-list-heading';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import type { MeasurementType } from '@/lib/exercises/constants';
import { findPersonalBest, type ProgressPoint } from '@/lib/exercises/progress';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** 一覧に固定で出す件数 */
export const RECENT_RECORD_COUNT = 3;

type Props = {
  /** 全期間の系列（古い順）。期間チップで絞る前のもの */
  points: ProgressPoint[];
  measurementType: MeasurementType;
  onPressRecord: (sessionId: number) => void;
  onPressSeeAll: () => void;
};

/**
 * グラフ・内訳カードの下に置く「過去の記録」一覧。
 *
 * 今日から見た直近3件を固定で出し、グラフで選択中の点には連動させない。連動させると点を
 * タップするたびに一覧が入れ替わり、参照点として機能しなくなるため（選択中の回の詳細は
 * 真上の内訳カードが担うので情報は失われない）。期間チップにも連動させない。
 */
export function ExerciseRecordHistoryList({
  points,
  measurementType,
  onPressRecord,
  onPressSeeAll,
}: Props) {
  // ベストの判定は全期間の系列で行う（グラフのアンバー・内訳カードのバッジと同じ入口）
  const personalBest = useMemo(() => findPersonalBest(points), [points]);
  // 新しい順に3件
  const recent = useMemo(() => [...points].slice(-RECENT_RECORD_COUNT).reverse(), [points]);

  return (
    <View style={styles.container}>
      <RecordListHeading label="過去の記録" count={points.length} style={styles.heading} />

      <View style={styles.cards}>
        {recent.map((point) => (
          <ExerciseRecordCard
            key={point.dateKey}
            point={point}
            measurementType={measurementType}
            isBest={point.dateKey === personalBest?.dateKey}
            onPress={onPressRecord}
          />
        ))}
      </View>

      {/* 3件以下ならリンクを出しても同じ一覧が出るだけなので出さない */}
      {points.length > RECENT_RECORD_COUNT && (
        <TouchableOpacity
          style={styles.seeAll}
          onPress={onPressSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`この種目のすべての記録（全${points.length}件）を見る`}
        >
          <Text style={styles.seeAllText}>すべての記録を見る</Text>
          <DesignIcon name="chevron-right" size={IconSizes.inlineChevron} color={Colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  // 右の余白はカードの内側パディング(12px)＋枠(1px)ぶん。件数の右端と、下のカードのchevronの
  // 縦のラインを揃えるため
  heading: { paddingRight: 13 },
  cards: { gap: 8 },
  // 面も枠も持たないテキストリンク。カードと同列の選択肢に見えないようにする
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9 },
  seeAllText: { ...Typography.caption, fontWeight: '600', color: Colors.accent },
});
