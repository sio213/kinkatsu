import { CategoryChip } from '@/components/exercises/category-chip';
import { Checkbox } from '@/components/ui/checkbox';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS, type SetFieldKey } from '@/lib/workout/set-format';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  id: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: Partial<Record<SetFieldKey, number | null | undefined>>[];
  selected: boolean;
  onToggle: (id: number) => void;
  // 表示する値が実績値か目標値かでVoiceOver/TalkBackの読み上げに前置きを付ける（例:「目標」）。
  // 省略時は前置き無し（実績値扱い）
  accessibilityValuePrefix?: string;
  // setsが全カラムnullで要約が空文字列になった場合のプレースホルダー文言。history側は
  // 呼び出し元(getSessionExerciseCards)が✓確定セット0件のカードを除外済みのため実質発生しないが、
  // routine側は目標値を未入力のまま保存できるため、素の空白行に見えないよう明示的に指定させる
  emptyLabel?: string;
};

// components/workout/history-load-exercise-card.tsx（過去の記録から読み込む）・
// components/routines/routine-load-exercise-card.tsx（ルーティンから読み込む）で共通の
// 「チェックボックス+サムネイル+名前+カテゴリ+セット値サマリ」の行。データの取得元(実績値/目標値)
// が違うだけで表示の組み立ては同一のため、正規化した最小限のpropsだけを受け取る
export const SelectableExerciseRow = memo(function SelectableExerciseRow({
  id,
  name,
  category,
  measurementType,
  source,
  slug,
  sets,
  selected,
  onToggle,
  accessibilityValuePrefix,
  emptyLabel = '',
}: Props) {
  const images = getExerciseImages({ source, slug });
  const resolvedType = resolveMeasurementType(measurementType);
  const summary = formatHistorySetSummary(MEASUREMENT_COLUMNS[resolvedType], sets);
  const displaySummary = summary === '' ? emptyLabel : summary;

  const handlePress = () => onToggle(id);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${name}、${getCategoryLabel(category)}、${accessibilityValuePrefix ?? ''}${displaySummary}`}
    >
      <Checkbox checked={selected} />
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <CategoryChip category={category} />
        </View>
        <Text style={[styles.summary, summary === '' && styles.summaryEmpty]} numberOfLines={1}>
          {displaySummary}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary, flexShrink: 1 },
  summary: { ...Typography.footnote, color: Colors.textMuted },
  summaryEmpty: { color: Colors.textPlaceholder },
});
