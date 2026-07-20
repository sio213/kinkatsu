import { ExerciseIdentity } from '@/components/exercises/exercise-identity';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BestBadge } from '@/components/workout/best-badge';
import { Colors, Typography } from '@/constants/theme';
import { resolveMeasurementType, getCategoryLabel } from '@/lib/exercises/constants';
import { getExerciseImages, type ExerciseImages } from '@/lib/exercises/images';
import type { SetComparison } from '@/lib/workout/comparison';
import { summarizeExerciseSets, type SetLike } from '@/lib/workout/set-format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

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
  // 遷移先はこのカード自身では決めず、呼び出し元(app/(tabs)/calendar.tsxのDayCardList)に
  // 委ねる。今日パネルは種目詳細、過去日パネルは記録編集画面と、同じカードでも文脈によって
  // 遷移先が異なるため（2026-07-20）
  onPress: () => void;
  // 遷移先の説明（例:「タップして種目の詳細を見ます」）。exercise-card.tsx/session-card.tsxは
  // accessibilityLabel自体に行き先を含めているが、このカードは種目名・カテゴリ・セット概要の
  // 読み上げが既に長いため、行き先の説明はhintに分離する（@designer指摘: 遷移先が文脈で
  // 変わるようになった以上、読み上げだけでは行き先を予見できない）
  accessibilityHint?: string;
  // 直接予定の種目プレビュー（DirectScheduleExerciseGroup）用。setsが空のとき、通常の
  // 「0セット」（実在のセッションで記録し忘れた場合の表示、既存の意味）ではなくこちらを表示する
  // ことで、「一度も実施したことが無い」を「記録し忘れた」と混同させない（@designer指摘、2026-07-20）
  emptySetsLabel?: string;
};

// カレンダーの選択日パネル用の読み取り専用種目カード。session-exercise-card.tsx・
// routine-template-exercise-card.tsxと違い展開/折りたたみや⋮メニューを持たず、カード全体が
// 1つのタップ領域。chevronは装飾のみで独立したタップ対象にはしない
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
  accessibilityHint,
  emptySetsLabel,
}: Props) {
  const images: ExerciseImages = getExerciseImages({ source, slug });
  const resolvedMeasurementType = resolveMeasurementType(measurementType);
  const confirmedSets = sets.filter((s) => s.completedAt != null);
  const summary =
    confirmedSets.length === 0 && emptySetsLabel ? emptySetsLabel : summarizeExerciseSets(resolvedMeasurementType, confirmedSets);
  const categoryLabel = getCategoryLabel(category);
  const isIncrease = comparison != null && comparison.delta > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}、${categoryLabel}、${summary}${isBest ? '、自己ベスト' : ''}${comparison ? `、前回比${comparison.label}` : ''}`}
      accessibilityHint={accessibilityHint}
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
              <Text style={[styles.comparisonText, { color: isIncrease ? Colors.success : Colors.danger }]}>
                {comparison.label}
              </Text>
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
  // デザイン案指定の色分け（増加#15803D/減少#DC2626のプレーンなテキスト、アイコンは無し）に
  // そのまま合わせる。サイズはBestBadgeと同じ「バッジ的な強調テキスト」の役割のためTypography.badgeを使う
  comparisonText: { ...Typography.badge, flexShrink: 0 },
});
