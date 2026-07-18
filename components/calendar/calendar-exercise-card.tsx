import { ExerciseIdentity } from '@/components/exercises/exercise-identity';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BestBadge } from '@/components/workout/best-badge';
import { Colors, Typography } from '@/constants/theme';
import { resolveMeasurementType, getCategoryLabel } from '@/lib/exercises/constants';
import { getExerciseImages, type ExerciseImages } from '@/lib/exercises/images';
import type { SetComparison } from '@/lib/workout/comparison';
import { summarizeExerciseSets, type SetLike } from '@/lib/workout/set-format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// getSessionExerciseCards由来のsetsは、プリフィル用途で✓未確定(completedAt null)のセットも
// 含んだまま返ってくる。自己ベスト判定(computePersonalBestIds)は確定セットしか見ていないため、
// 表示側もここで確定セットだけに絞らないと「セット数」「代表値」が自己ベスト判定や他の履歴表示
// （history-picker系のformatHistorySetSummary）と基準がズレて食い違って見えてしまう
type HistorySetLike = SetLike & { completedAt: number | null };

type Props = {
  exerciseId: number;
  name: string;
  category: string;
  // source/slugはgetExerciseImages用（既存のExercise型のPickと同じ形）
  source: string;
  slug: string | null;
  measurementType: string;
  sets: HistorySetLike[];
  isBest: boolean;
  // 直前の同種目セッションとの比較（hooks/use-calendar-day-exercises.tsで算出）。
  // 比較対象が無い/変化なしならnull
  comparison: SetComparison | null;
  onPress: (exerciseId: number) => void;
};

// カレンダーの選択日パネル用の読み取り専用種目カード。session-exercise-card.tsx・
// routine-template-exercise-card.tsxと違い展開/折りたたみや⋮メニューを持たず、カード全体が
// 1つのタップ領域（種目詳細へ遷移）。chevronは装飾のみで独立したタップ対象にはしない
export const CalendarExerciseCard = memo(function CalendarExerciseCard({
  exerciseId,
  name,
  category,
  source,
  slug,
  measurementType,
  sets,
  isBest,
  comparison,
  onPress,
}: Props) {
  const images: ExerciseImages = getExerciseImages({ source, slug });
  const resolvedMeasurementType = resolveMeasurementType(measurementType);
  const confirmedSets = sets.filter((s) => s.completedAt != null);
  const summary = summarizeExerciseSets(resolvedMeasurementType, confirmedSets);
  const categoryLabel = getCategoryLabel(category);
  const isIncrease = comparison != null && comparison.delta > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(exerciseId)}
      accessibilityRole="button"
      accessibilityLabel={`${name}、${categoryLabel}、${summary}${isBest ? '、自己ベスト' : ''}${comparison ? `、前回比${comparison.label}` : ''}`}
    >
      <ExerciseIdentity
        images={images}
        name={name}
        category={category}
        nameTrailing={isBest && <BestBadge />}
        metaTrailing={
          <>
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
            {comparison && (
              <View style={styles.comparison}>
                <IconSymbol name={isIncrease ? 'arrow.up' : 'arrow.down'} size={11} color={Colors.textBody} />
                <Text style={styles.comparisonText}>{comparison.label}</Text>
              </View>
            )}
          </>
        }
      />
      <IconSymbol name="chevron.right" size={19} color={Colors.textPlaceholder} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 10,
  },
  // カテゴリチップ・概要・前回比較の3要素がmetaRow内で横並びになるため、幅が足りない場合は
  // 概要(summary)側を縮めて前回比較(comparison)が切れないようにする
  summary: { ...Typography.footnote, color: Colors.textMuted, flexShrink: 1 },
  // 前回比較の増減は、カテゴリ色（塗りつぶし色）・Colors.danger（エラー色）との衝突を避けるため
  // 色ではなく上下矢印アイコンで方向を表現し、文字色は中立なtextBodyに統一している
  comparison: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  comparisonText: { ...Typography.footnote, fontWeight: '700', color: Colors.textBody },
});
