import { ExerciseRowFrame } from '@/components/exercises/exercise-row-frame';
import { Checkbox } from '@/components/ui/checkbox';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS, type SetFieldKey } from '@/lib/workout/set-format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

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
// components/routines/routine-load-exercise-card.tsx（ルーティンから読み込む）で共通の行。
// **行全体がチェックのタップ領域**（汗ばんだ指の前提で、チェックボックス単体を狙わせない）。
// 見た目の組み立てはcomponents/exercises/exercise-row-frame.tsxと共有する
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
  const resolvedType = resolveMeasurementType(measurementType);
  const summary = formatHistorySetSummary(MEASUREMENT_COLUMNS[resolvedType], sets);
  const displaySummary = summary === '' ? emptyLabel : summary;

  return (
    <TouchableOpacity
      onPress={() => onToggle(id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${name}、${getCategoryLabel(category)}、${accessibilityValuePrefix ?? ''}${displaySummary}`}
    >
      <ExerciseRowFrame
        checkbox={<Checkbox checked={selected} />}
        name={name}
        category={category}
        source={source}
        slug={slug}
        body={
          <Text style={[styles.summary, summary === '' && styles.summaryEmpty]} numberOfLines={1}>
            {displaySummary}
          </Text>
        }
      />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  summary: { ...Typography.footnote, color: Colors.textMuted },
  summaryEmpty: { color: Colors.textPlaceholder },
});
